import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import {
  RegisterDTO,
  LoginDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
} from './dto';
import { throwError } from 'src/common/utils';
import * as bcrypt from 'bcryptjs';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EmailsService } from 'src/emails/emails.service';
import { ConfigService } from '@nestjs/config';
import {
  accountCreatedSubject,
  emailChangeSubject,
  resetPasswordSubject,
} from 'src/common/translations';
import { JwtService } from '@nestjs/jwt';
import { HttpStatus } from 'src/common/utils/http-status';
import { verifyGoogleToken } from './utils';
import { SmsService } from 'src/sms/sms.service';
import { SaltService } from 'src/salt/salt.service';
import { generateHash } from 'src/common/utils/generateHash';
import { User } from 'src/users/entities/user.entity';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { PlansService } from 'src/plans/plans.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSession } from './entities/user-session.entity';
import { SessionsService } from './sessions.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserSession)
    private userSessionsRepository: Repository<UserSession>,
    private readonly usersService: UsersService,
    private scheduleRegistry: SchedulerRegistry,
    private readonly emailsService: EmailsService,
    private readonly configService: ConfigService,
    private jwtService: JwtService,
    private readonly smsService: SmsService,
    private readonly saltService: SaltService,
    private readonly codeCore: CodeCoreService,
    private readonly plansService: PlansService,
    private readonly sessionsService: SessionsService,
  ) {}

  async register(registerDTO: RegisterDTO) {
    const existingUser = await this.usersService.findByEmail(registerDTO.email);

    if (existingUser && existingUser.emailVerified) {
      throwError(
        HttpStatus.CONFLICT,
        'User exist',
        'User with this email already exists',
        'USER_ALREADY_EXISTS',
      );
    }

    const hashed = await bcrypt.hash(registerDTO.password, 10);

    let userData: Partial<User>;
    if (existingUser && !existingUser.emailVerified) {
      userData = {
        hash: existingUser.hash,
        password: hashed,
        oauthProvider: null,
        oauthProviderId: null,
      };
      await this.usersService.update(existingUser.uuid, userData);
    } else {
      const user = await this.usersService.findByUUID(registerDTO.uuid);

      if (!user) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found',
          'User with this UUID does not exist.',
          'USER_NOT_FOUND',
        );
      }
      userData = {
        hash: user.hash,
        email: registerDTO.email,
        password: hashed,
        oauthProvider: null,
        oauthProviderId: null,
      };
      await this.usersService.update(user.uuid, userData);
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'register_email',
      { email: registerDTO.email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = registerDTO.lang || 'en';

    await this.emailsService.send(
      [registerDTO.email],
      lang === 'en' ? accountCreatedSubject.en : accountCreatedSubject.uk,
      lang === 'en' ? '/auth/register-en' : '/auth/register-uk',
      {
        code: code,
      },
    );

    const savedUser = await this.usersService.findByEmail(registerDTO.email);

    return {
      status,
      user: savedUser,
    };
  }

  async emailConfirmation(
    email: string,
    code: string,
    type: 'register_email' | 'email_change' = 'register_email',
    deviceId?: string,
    devicePubKey?: string,
    userAgent?: string | null,
    ip?: string | null,
  ) {
    const v = await this.codeCore.verify(type, { email }, code);
    if (v.status !== 'OK') {
      const msg =
        v.status === 'EXPIRED_CODE'
          ? 'The provided code has expired.'
          : v.status === 'ATTEMPTS_EXCEEDED'
            ? 'Maximum attempts exceeded.'
            : 'The provided code is invalid.';
      throwError(HttpStatus.BAD_REQUEST, 'Invalid code', msg, v.status);
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    if (type === 'register_email') {
      user.emailVerified = true;
      user.isRegistered = true;
      user.isLogged = true;
    } else {
      user.email = user.newEmail;
      user.newEmail = null;
      user.emailVerified = true;
    }

    await this.usersService.update(user.uuid, user);

    const updatedUser = await this.usersService.findById(user.id);

    const tokens = await this.sessionsService.issueTokens(
      updatedUser!,
      deviceId,
      devicePubKey,
      userAgent ?? null,
      ip ?? null,
    );

    return {
      message: 'Email verified successfully.',
      user: updatedUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceId: tokens.deviceId,
    };
  }

  async resendCode(
    email: string,
    lang: string = 'en',
    type: 'register' | 'newEmail' = 'register',
  ) {
    const user =
      type === 'register'
        ? await this.usersService.findByEmail(email)
        : await this.usersService.findByNewEmail(email);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this email does not exist.',
        'USER_NOT_FOUND',
      );
    }

    if (user.emailVerified && type === 'register') {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Email already verified',
        'This email is already verified.',
        'EMAIL_ALREADY_VERIFIED',
      );
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      type === 'register' ? 'register_email' : 'email_change',
      { email: user.email as string },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    if (type === 'register') {
      await this.emailsService.send(
        [user.email as string],
        lang === 'en' ? accountCreatedSubject.en : accountCreatedSubject.uk,
        lang === 'en' ? '/auth/register-en' : '/auth/register-uk',
        {
          code: code,
        },
      );
    } else {
      await this.emailsService.send(
        [user.newEmail as string],
        lang === 'en' ? emailChangeSubject.en : emailChangeSubject.uk,
        lang === 'en' ? '/auth/email-change-en' : '/auth/email-change-uk',
        {
          code: code,
        },
      );
    }

    return { message: 'Verification code resent successfully.' };
  }

  async login(
    loginDTO: LoginDTO,
    userAgent?: string | null,
    ip?: string | null,
  ) {
    const user = await this.usersService.findByEmail(loginDTO.email);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this email does not exist.',
        'USER_NOT_FOUND',
      );
    }

    if (!user.emailVerified) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Email not verified',
        'Please verify your email first.',
        'EMAIL_NOT_VERIFIED',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDTO.password,
      user.password as string,
    );

    if (!isPasswordValid) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid password',
        'The password you entered is incorrect.',
        'INVALID_PASSWORD',
      );
    }

    if (user.uuid !== loginDTO.uuid) {
      await this.usersService.deleteUserByUuid(loginDTO.uuid);
    }

    await this.usersService.update(user.uuid, {
      hash: user.hash,
      isLogged: true,
    });

    const updatedUser = await this.usersService.findByEmail(loginDTO.email);

    const { plan } = await this.plansService.getActualByUserId(updatedUser!.id);

    const settings = await this.usersService.getUserSettings(updatedUser!.id);

    const tokens = await this.sessionsService.issueTokens(
      updatedUser!,
      loginDTO.deviceId,
      loginDTO.devicePubKey,
      userAgent ?? null,
      ip ?? null,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceId: tokens.deviceId,
      user: updatedUser,
      plan,
      settings,
    };
  }

  async loginByUUID(
    uuid: string,
    devicePubKey: string,
    isFirstInstall: boolean,
    userAgent?: string | null,
    ip?: string | null,
  ) {
    const user = await this.usersService.findByUUID(uuid);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }

    const { plan } = await this.plansService.getActualByUserId(user.id);

    const settings = await this.usersService.getUserSettings(user.id);

    const tokens = await this.sessionsService.issueTokens(
      user,
      undefined,
      devicePubKey,
      userAgent ?? null,
      ip ?? null,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceId: tokens.deviceId,
      user,
      plan,
      settings,
      isFirstInstall,
    };
  }

  async createToken(uuid: string, hash: string) {
    const user = await this.usersService.findByUUID(uuid);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
      return;
    }

    const salt = await this.saltService.getSaltByUserId(user.id);
    const hashToCompare = generateHash(uuid, salt!.value);

    if (hash !== hashToCompare) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid hash',
        'The provided hash is invalid.',
        'INVALID_HASH',
      );
      return;
    }

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    // TODO: Переробити з точки зору безпеки, щоб там не було сенсетів данних
    const accessToken = this.jwtService.sign(
      { ...user },
      {
        expiresIn: Number(expiresIn),
      },
    );

    return { accessToken };
  }

  async resetPassword(resetPasswordDTO: ResetPasswordDTO) {
    const user = await this.usersService.findByEmail(resetPasswordDTO.email);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this email does not exist.',
        'USER_NOT_FOUND',
      );
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'password_reset',
      { email: resetPasswordDTO.email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = resetPasswordDTO.lang || 'en';
    await this.emailsService.send(
      [resetPasswordDTO.email],
      lang === 'en' ? resetPasswordSubject.en : resetPasswordSubject.uk,
      lang === 'en' ? '/auth/reset-password-en' : '/auth/reset-password-uk',
      { code },
    );

    return {
      status: 'SENT',
      message: 'Reset password email sent successfully.',
    };
  }

  async changePassword(changePasswordDto: ChangePasswordDTO) {
    const { email, code, password } = changePasswordDto;
    const v = await this.codeCore.verify('password_reset', { email }, code);
    if (v.status !== 'OK') {
      const msg =
        v.status === 'EXPIRED_CODE'
          ? 'The provided code has expired.'
          : v.status === 'ATTEMPTS_EXCEEDED'
            ? 'Maximum attempts exceeded.'
            : 'The provided code is invalid.';
      throwError(HttpStatus.BAD_REQUEST, 'Invalid code', msg, v.status);
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    await this.usersService.update(user.uuid, user);
    return { message: 'Password changed successfully.', status: 'OK' };
  }

  async signInWithGoogle(
    userId: number,
    uuid: string,
    idToken: string,
    deviceId: string,
    devicePubKey: string,
    userAgent?: string | null,
    ip?: string | null,
  ) {
    const payload = (await verifyGoogleToken(idToken)) as {
      email: string | null;
      sub: string;
    };

    if (!payload) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid Google token',
        'The provided Google token is invalid or has expired.',
        'INVALID_GOOGLE_TOKEN',
      );
    }

    const existUser = await this.usersService.findByEmail(payload.email);

    if (existUser && existUser.oauthProviderId === payload.sub) {
      if (existUser.uuid !== uuid) {
        await this.usersService.deleteUserByUuid(uuid);
      }

      const { user: updatedUser } = await this.usersService.update(
        existUser.uuid,
        {
          hash: existUser.hash,
          isLogged: true,
          isRegistered: true,
          emailVerified: true,
        },
      );

      const { plan } = await this.plansService.getActualByUserId(
        updatedUser.id,
      );

      const settings = await this.usersService.getUserSettings(updatedUser.id);

      const tokens = await this.sessionsService.issueTokens(
        updatedUser,
        deviceId,
        devicePubKey,
        userAgent ?? null,
        ip ?? null,
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        deviceId: tokens.deviceId,
        user: updatedUser,
        plan,
        settings,
      };
    } else if (
      existUser &&
      existUser.oauthProviderId &&
      existUser.oauthProviderId !== payload.sub
    ) {
      throwError(
        HttpStatus.CONFLICT,
        'Email already in use',
        'The email associated with this Google account is already in use.',
        'EMAIL_ALREADY_IN_USE',
      );
    } else if (existUser && !existUser.oauthProviderId && existUser.password) {
      throwError(
        HttpStatus.CONFLICT,
        'Email already in use',
        'The email associated with this Google account is already in use. Please log in using your email and password.',
        'EMAIL_ALREADY_IN_USE_LOGIN_EMAIL_PASSWORD',
      );
    } else {
      const userData = {
        email: payload.email,
        oauthProvider: 'google',
        oauthProviderId: payload.sub,
        isRegistered: true,
        isLogged: true,
        emailVerified: true,
      };

      const user = await this.usersService.updateByIdAndUuid(
        userId,
        uuid,
        userData,
      );

      if (!user) {
        throwError(
          HttpStatus.CONFLICT,
          'User mismatch',
          'The provided userId and uuid do not match any existing user.',
          'USER_MISMATCH',
        );
      }

      const { plan } = await this.plansService.getActualByUserId(user.id);

      const settings = await this.usersService.getUserSettings(user.id);

      const tokens = await this.sessionsService.issueTokens(
        user,
        deviceId,
        devicePubKey,
        userAgent ?? null,
        ip ?? null,
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        deviceId: tokens.deviceId,
        user,
        plan,
        settings,
      };
    }
  }
}

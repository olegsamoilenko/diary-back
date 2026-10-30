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

import { User } from 'src/users/entities/user.entity';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { PlansService } from 'src/plans/plans.service';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserSession } from './entities/user-session.entity';
import { SessionsService } from './sessions.service';
import { AiPreferencesService } from 'src/ai/ai-preferences.service';
import {
  assertCurrentUserAccess,
  UserAccessClaims,
} from './user-access-claims';

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
    private readonly aiPreferencesService: AiPreferencesService,
  ) {}

  private async registrationGuest(uuid: string, authorization?: string) {
    const token = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1];
    let principal: UserAccessClaims | undefined;
    try {
      if (token)
        principal = await this.jwtService.verifyAsync<UserAccessClaims>(token);
    } catch {
      // A UUID is an identifier, never proof of ownership.
    }
    if (!principal || principal.uuid !== uuid) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Registration session required',
        'A valid guest session is required. Please update the app or sign in.',
        'REGISTRATION_SESSION_REQUIRED',
      );
    }
    const user = await this.usersService.findByUUID(uuid);
    if (!user || user.id !== principal.id) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'User mismatch',
        'The registration session does not match this profile.',
        'USER_MISMATCH',
      );
    }
    assertCurrentUserAccess(principal, user, process.env.JWT_SECRET ?? '');
    if (
      user.isRegistered ||
      user.emailVerified ||
      user.oauthProvider ||
      user.oauthProviderId
    ) {
      throwError(
        HttpStatus.CONFLICT,
        'Account already registered',
        'Sign in to this account. Registration cannot change an existing account.',
        'REGISTRATION_ACCOUNT_ALREADY_REGISTERED',
      );
    }
    return user;
  }

  async register(registerDTO: RegisterDTO, authorization?: string) {
    const user = await this.registrationGuest(registerDTO.uuid, authorization);
    const email = registerDTO.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);

    // An unverified address belonging to another guest is not ours to overwrite.
    if (existingUser && existingUser.id !== user.id) {
      throwError(
        HttpStatus.CONFLICT,
        'User exist',
        'User with this email already exists',
        'USER_ALREADY_EXISTS',
      );
    }

    const hashed = await bcrypt.hash(registerDTO.password, 10);

    await this.usersService.updateRegistrationGuest(user, {
      email,
      password: hashed,
    });

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'register_email',
      { email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = registerDTO.lang || 'en';

    await this.emailsService.send(
      [email],
      lang === 'en' ? accountCreatedSubject.en : accountCreatedSubject.uk,
      lang === 'en' ? '/auth/register-en' : '/auth/register-uk',
      {
        code: code,
      },
    );

    const savedUser = await this.usersService.findByEmail(email);

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
      await this.usersService.updateRegistrationGuest(user, {
        emailVerified: true,
        isRegistered: true,
        isLogged: true,
      });
    } else {
      user.email = user.newEmail;
      user.newEmail = null;
      user.emailVerified = true;
      await this.usersService.update(user.uuid, user);
    }

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

    if (user && !user.password && user.oauthProviderId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Login with social',
        'This email is already used for login via social networks. Please log in via social networks..',
        'LOGIN_WITH_SOCIAL',
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
      await this.usersService.deleteAnonymousUserByUuid(loginDTO.uuid);
    }

    await this.usersService.update(user.uuid, {
      hash: user.hash,
      isLogged: true,
    });

    const updatedUser = await this.usersService.findByEmail(loginDTO.email);
    if (!updatedUser || updatedUser.password !== user.password) {
      // Do not turn a password verified before reset into a fresh session.
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Credentials changed',
        'Sign in again with your current password.',
        'CREDENTIALS_CHANGED',
      );
    }

    const { plan } = await this.plansService.getActualByUserId(updatedUser.id);

    const settings = await this.usersService.getUserSettings(updatedUser.id);

    const aiPreferences = await this.aiPreferencesService.getForUser(
      updatedUser.id,
    );

    const tokens = await this.sessionsService.issueTokens(
      updatedUser,
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
      aiPreferences,
    };
  }

  async loginByUUID(
    uuid: string,
    devicePubKey: string,
    isFirstInstall: boolean,
    deviceId?: string,
    userAgent?: string | null,
    ip?: string | null,
    manager?: EntityManager,
  ) {
    const user = manager
      ? await this.usersService.findByUUID(uuid, [], manager)
      : await this.usersService.findByUUID(uuid);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }

    const { plan } = await this.plansService.getActualByUserId(
      user.id,
      ...(manager ? [manager] : []),
    );

    const settings = await this.usersService.getUserSettings(
      user.id,
      ...(manager ? [manager] : []),
    );

    const aiPreferences = await this.aiPreferencesService.getForUser(
      user.id,
      ...(manager ? [manager] : []),
    );

    const tokens = await this.sessionsService.issueTokens(
      user,
      deviceId,
      devicePubKey,
      userAgent ?? null,
      ip ?? null,
      ...(manager ? [manager] : []),
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceId: tokens.deviceId,
      user,
      plan,
      settings,
      aiPreferences,
      isFirstInstall,
    };
  }

  createToken(_uuid: string, _hash: string) {
    // Retain the route/error contract, but identifiers are not login credentials.
    throwError(
      HttpStatus.UNAUTHORIZED,
      'Session required',
      'Refresh your session or sign in again.',
      'SESSION_REQUIRED',
    );
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

    if (user && user.oauthProvider && user.oauthProviderId) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Cannot reset password for Google users',
        'Password reset is not available for users registered via Google OAuth.',
        'CANNOT_RESET_PASSWORD_FOR_GOOGLE_USERS',
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
    await this.sessionsService.resetPasswordAndRevokeSessions(user.id, hashed);
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
    authorization?: string,
  ) {
    const payload = (await verifyGoogleToken(idToken)) as {
      email: string | null;
      sub: string;
    };

    if (!payload?.email || !payload.sub) {
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
        await this.usersService.deleteAnonymousUserByUuid(uuid);
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
      const guest = await this.registrationGuest(uuid, authorization);
      if (guest.id !== userId || (existUser && existUser.id !== guest.id)) {
        throwError(
          HttpStatus.CONFLICT,
          'User mismatch',
          'This Google address belongs to another profile.',
          'USER_MISMATCH',
        );
      }
      const userData = {
        email: payload.email,
        oauthProvider: 'google',
        oauthProviderId: payload.sub,
        isRegistered: true,
        isLogged: true,
        emailVerified: true,
      };

      const user = await this.usersService.updateRegistrationGuest(
        guest,
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

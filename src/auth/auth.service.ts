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
import { User } from '../users/entities/user.entity';
import { CodeCoreService } from 'src/code-core/code-core.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private scheduleRegistry: SchedulerRegistry,
    private readonly emailsService: EmailsService,
    private readonly configService: ConfigService,
    private jwtService: JwtService,
    private readonly smsService: SmsService,
    private readonly saltService: SaltService,
    private readonly codeCore: CodeCoreService,
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
      return;
    }

    const hashed = await bcrypt.hash(registerDTO.password, 10);

    let userData: Partial<User>;
    let savedUser: User | null = null;
    if (existingUser && !existingUser.emailVerified) {
      userData = {
        password: hashed,
        oauthProvider: null,
        oauthProviderId: null,
      };
      savedUser = await this.usersService.update(existingUser.id, userData);
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
        email: registerDTO.email,
        password: hashed,
        oauthProvider: null,
        oauthProviderId: null,
      };
      savedUser = await this.usersService.update(user!.id, userData);
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

    return {
      status,
      user: savedUser,
    };
  }

  async emailConfirmation(email: string, code: string) {
    const v = await this.codeCore.verify('register_email', { email }, code);
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

    user!.emailVerified = true;
    user!.isRegistered = true;
    user!.isLogged = true;
    await this.usersService.update(user!.id, user!);

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;
    const accessToken = this.jwtService.sign(
      { ...user },
      { expiresIn: Number(expiresIn) },
    );
    const updatedUser = await this.usersService.findById(user!.id);

    return {
      message: 'Email verified successfully.',
      user: updatedUser,
      accessToken,
    };
  }

  async newEmailConfirmation(email: string, code: string) {
    const v = await this.codeCore.verify(
      'email_change',
      { email: email },
      code,
    );
    if (v.status !== 'OK') {
      const msg =
        v.status === 'EXPIRED_CODE'
          ? 'The provided code has expired.'
          : v.status === 'ATTEMPTS_EXCEEDED'
            ? 'Maximum attempts exceeded.'
            : 'The provided code is invalid.';
      throwError(HttpStatus.BAD_REQUEST, 'Invalid code', msg, v.status);
    }

    const user = await this.usersService.findByNewEmail(email);
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    user.email = user.newEmail;
    user.newEmail = null;
    user.emailVerified = true;

    await this.usersService.update(user.id, user);

    const updatedUser = await this.usersService.findById(user.id);

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;
    const accessToken = this.jwtService.sign(
      { ...updatedUser },
      { expiresIn: Number(expiresIn) },
    );

    return {
      message: 'Email verified successfully.',
      user: updatedUser,
      accessToken,
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

    if (user!.emailVerified && type === 'register') {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Email already verified',
        'This email is already verified.',
        'EMAIL_ALREADY_VERIFIED',
      );
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      type === 'register' ? 'register_email' : 'email_change',
      { email: email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    if (type === 'register') {
      await this.emailsService.send(
        [user!.email as string],
        lang === 'en' ? accountCreatedSubject.en : accountCreatedSubject.uk,
        lang === 'en' ? '/auth/register-en' : '/auth/register-uk',
        {
          code: code,
        },
      );
    } else {
      await this.emailsService.send(
        [user!.newEmail as string],
        lang === 'en' ? emailChangeSubject.en : emailChangeSubject.uk,
        lang === 'en' ? '/auth/email-change-en' : '/auth/email-change-uk',
        {
          code: code,
        },
      );
    }

    return { message: 'Verification code resent successfully.' };
  }

  async login(loginDTO: LoginDTO) {
    const user = await this.usersService.findByEmail(loginDTO.email);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this email does not exist.',
        'USER_NOT_FOUND',
      );
    }

    if (!user!.emailVerified) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Email not verified',
        'Please verify your email first.',
        'EMAIL_NOT_VERIFIED',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDTO.password,
      user!.password as string,
    );

    if (!isPasswordValid) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid password',
        'The password you entered is incorrect.',
        'INVALID_PASSWORD',
      );
    }

    if (user!.uuid !== loginDTO.uuid) {
      await this.usersService.deleteUserByUuid(loginDTO.uuid);
    }

    const updatedUser = await this.usersService.update(user!.id, {
      isLogged: true,
    });

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    const accessToken = this.jwtService.sign(
      { ...updatedUser },
      {
        expiresIn: Number(expiresIn),
      },
    );

    return {
      accessToken,
      user: updatedUser,
    };
  }

  async loginByUUID(uuid: string) {
    const user = await this.usersService.findByUUID(uuid);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    const accessToken = this.jwtService.sign(
      { ...user },
      {
        expiresIn: Number(expiresIn),
      },
    );

    return {
      accessToken,
      user,
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
    user!.password = hashed;
    await this.usersService.update(user!.id, user!);
    return true;
  }

  async signInWithGoogle(userId: number, uuid: string, idToken: string) {
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
      return;
    }

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    const existUser = await this.usersService.findByEmail(payload.email, [
      'plan',
      'settings',
    ]);

    if (existUser && existUser.oauthProviderId === payload.sub) {
      await this.usersService.deleteUserByUuid(uuid);

      const updatedUser = await this.usersService.update(existUser.id, {
        isLogged: true,
      });

      const accessToken = this.jwtService.sign(
        { ...updatedUser },
        {
          expiresIn: Number(expiresIn),
        },
      );

      return {
        accessToken,
        user: updatedUser,
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
      return;
    } else if (existUser && !existUser.oauthProviderId && existUser.password) {
      throwError(
        HttpStatus.CONFLICT,
        'Email already in use',
        'The email associated with this Google account is already in use. Please log in using your email and password.',
        'EMAIL_ALREADY_IN_USE_LOGIN_EMAIL_PASSWORD',
      );
      return;
    } else {
      const userData = {
        email: payload.email,
        oauthProvider: 'google',
        oauthProviderId: payload.sub,
        isRegistered: true,
        isLogged: true,
      };

      const user = await this.usersService.updateByIdAndUuid(
        userId,
        uuid,
        userData,
      );

      const accessToken = this.jwtService.sign(
        { ...user },
        {
          expiresIn: Number(expiresIn),
        },
      );

      return {
        accessToken,
        user,
      };
    }
  }

  // async signInWithPhone(id: number, phone: string) {
  //   const user = await this.usersService.findById(Number(id));
  //
  //   if (!user) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'User not found',
  //       'User with this UUID does not exist.',
  //     );
  //   }
  //
  //   const existingUser = await this.usersService.findByPhone(phone, ['plan']);
  //
  //   if (existingUser) {
  //     const code = Math.floor(100000 + Math.random() * 900000).toString();
  //
  //     await this.smsService.sendSms(
  //       phone,
  //       `Your verification code is: ${code}`,
  //     );
  //
  //     existingUser.phoneVerificationCode = code;
  //     await this.usersService.update(existingUser.id, existingUser);
  //
  //     const jobName = `phoneVerificationCode-${existingUser.id}`;
  //     if (this.scheduleRegistry.doesExist('timeout', jobName)) {
  //       this.scheduleRegistry.deleteTimeout(jobName);
  //     }
  //
  //     const timeout = setTimeout(
  //       () => {
  //         user!.phoneVerificationCode = null;
  //         this.usersService
  //           .update(existingUser.id, existingUser)
  //           .catch((err) => console.error('Error in email code removal:', err));
  //       },
  //       5 * 60 * 1000,
  //     );
  //
  //     this.scheduleRegistry.addTimeout(jobName, timeout);
  //   } else {
  //     const code = Math.floor(100000 + Math.random() * 900000).toString();
  //
  //     const userData = {
  //       phone: phone,
  //       phoneVerificationCode: code,
  //     };
  //
  //     await this.usersService.update(user!.id, userData);
  //
  //     const jobName = `phoneVerificationCode-${user!.id}`;
  //     if (this.scheduleRegistry.doesExist('timeout', jobName)) {
  //       this.scheduleRegistry.deleteTimeout(jobName);
  //     }
  //
  //     const timeout = setTimeout(
  //       () => {
  //         user!.phoneVerificationCode = null;
  //         this.usersService
  //           .update(user!.id, user!)
  //           .catch((err) => console.error('Error in email code removal:', err));
  //       },
  //       5 * 60 * 1000,
  //     );
  //
  //     this.scheduleRegistry.addTimeout(jobName, timeout);
  //   }
  // }
  //
  // async verifyPhone(code: string) {
  //   const user = await this.usersService.findByPhoneVerificationCode(code);
  //
  //   if (!user) {
  //     throwError(
  //       HttpStatus.BAD_REQUEST,
  //       'Invalid token',
  //       'The provided token is invalid or has expired.',
  //     );
  //   }
  //
  //   user!.phoneVerificationCode = null;
  //   user!.isRegistered = true;
  //
  //   await this.usersService.update(user!.id, user!);
  //
  //   const expiresIn: number =
  //     this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;
  //
  //   const accessToken = this.jwtService.sign(
  //     { ...user },
  //     {
  //       expiresIn: Number(expiresIn),
  //     },
  //   );
  //
  //   return {
  //     message: 'Phone number verified successfully.',
  //     user,
  //     accessToken,
  //   };
  // }

  // async logout() {
  //
  //
  //   return { message: 'Logged out successfully' };
  // }
}

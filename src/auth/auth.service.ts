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
import { randomBytes } from 'crypto';
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
  ) {}

  async register(registerDTO: RegisterDTO) {
    const existingUser = await this.usersService.findByEmail(registerDTO.email);

    if (existingUser) {
      throwError(
        HttpStatus.CONFLICT,
        'User exist',
        'User with this email already exists',
        'USER_ALREADY_EXISTS',
      );
    }

    const user = await this.usersService.findByUUID(registerDTO.uuid);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }

    const hashed = await bcrypt.hash(registerDTO.password, 10);

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const userData = {
      email: registerDTO.email,
      password: hashed,
      emailVerificationCode: code,
      oauthProvider: null,
      oauthProviderId: null,
    };

    const savedUser = await this.usersService.update(user!.id, userData);

    const jobName = `emailVerificationCode-${user!.id}`;
    if (this.scheduleRegistry.doesExist('timeout', jobName)) {
      this.scheduleRegistry.deleteTimeout(jobName);
    }

    const timeout = setTimeout(
      () => {
        void (async () => {
          const actualUser = await this.usersService.findById(user!.id);
          if (actualUser?.emailVerificationCode) {
            actualUser.emailVerificationCode = null;
            await this.usersService.update(user!.id, actualUser);
          }
        })();
      },
      5 * 60 * 1000,
    );

    this.scheduleRegistry.addTimeout(jobName, timeout);

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
      user: savedUser,
    };
  }

  async emailConfirmation(code: string) {
    const user = await this.usersService.findByEmailVerificationCode(code);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid code',
        'The provided code is invalid or has expired.',
        'INVALID_CODE',
      );
    }

    user!.emailVerified = true;
    user!.emailVerificationCode = null;
    user!.isRegistered = true;
    user!.isLogged = true;

    await this.usersService.update(user!.id, user!);

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    const accessToken = this.jwtService.sign(
      { ...user },
      {
        expiresIn: Number(expiresIn),
      },
    );

    const updatedUser = await this.usersService.findById(user!.id);

    return {
      message: 'Email verified successfully.',
      user: updatedUser,
      accessToken,
    };
  }

  async newEmailConfirmation(code: string) {
    const user = await this.usersService.findByNewEmailVerificationCode(code);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid code',
        'The provided code is invalid or has expired.',
        'INVALID_CODE',
      );
    }

    user!.email = user!.newEmail;
    user!.newEmail = null;
    user!.emailVerified = true;
    user!.newEmailVerificationCode = null;

    await this.usersService.update(user!.id, user!);

    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    const accessToken = this.jwtService.sign(
      { ...user },
      {
        expiresIn: Number(expiresIn),
      },
    );

    const updatedUser = await this.usersService.findById(user!.id);

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
    const user = await this.usersService.findByEmail(email);

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    if (type === 'register') {
      user!.emailVerificationCode = code;
    } else {
      user!.newEmailVerificationCode = code;
    }

    await this.usersService.update(user!.id, user!);

    const jobName = `resendEmailVerificationCode-${user!.id}`;
    if (this.scheduleRegistry.doesExist('timeout', jobName)) {
      this.scheduleRegistry.deleteTimeout(jobName);
    }

    const timeout = setTimeout(
      () => {
        void (async () => {
          const actualUser = (await this.usersService.findById(
            user!.id,
          )) as User;
          if (
            actualUser &&
            actualUser.emailVerificationCode &&
            type === 'register'
          ) {
            actualUser.emailVerificationCode = null;
          }
          if (
            actualUser &&
            actualUser.newEmailVerificationCode &&
            type === 'newEmail'
          ) {
            actualUser.newEmailVerificationCode = null;
          }
          await this.usersService.update(user!.id, actualUser);
        })();
      },
      5 * 60 * 1000,
    );

    this.scheduleRegistry.addTimeout(jobName, timeout);

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
        [user!.email as string],
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

    console.log('Updated user after login:', updatedUser);

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    user!.passwordResetCode = code;

    await this.usersService.update(user!.id, user!);

    const jobName = `resetPassword-${user!.id}`;
    if (this.scheduleRegistry.doesExist('timeout', jobName)) {
      this.scheduleRegistry.deleteTimeout(jobName);
    }

    const timeout = setTimeout(
      () => {
        void (async () => {
          const actualUser = await this.usersService.findById(user!.id);
          if (actualUser?.passwordResetCode) {
            actualUser.passwordResetCode = null;
            await this.usersService.update(user!.id, actualUser);
          }
        })();
      },
      50 * 60 * 1000,
    );

    this.scheduleRegistry.addTimeout(jobName, timeout);

    const lang = resetPasswordDTO.lang || 'en';

    await this.emailsService.send(
      [user!.email as string],
      lang === 'en' ? resetPasswordSubject.en : resetPasswordSubject.uk,
      lang === 'en' ? '/auth/reset-password-en' : '/auth/reset-password-uk',
      {
        code: code,
      },
    );

    return { message: 'Reset password email sent successfully.' };
  }

  async changePassword(changePasswordDto: ChangePasswordDTO) {
    const user = await this.usersService.findByPasswordResetCode(
      changePasswordDto.code,
    );

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid code',
        'The provided code is invalid or has expired.',
        'INVALID_CODE',
      );
    }

    const hashed = await bcrypt.hash(changePasswordDto.password, 10);

    user!.password = hashed;
    user!.passwordResetCode = null;

    await this.usersService.update(user!.id, user!);

    return true;
  }

  async signInWithGoogle(userId: number, uuid: string, idToken: string) {
    const payload = (await verifyGoogleToken(idToken)) as {
      email: string | null;
      sub: string;
    };

    console.log('Google payload:', payload);

    if (!payload) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid Google token',
        'The provided Google token is invalid or has expired.',
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

import { HttpStatus, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { RegisterDTO, LoginDTO, ResetPasswordDTO } from './dto';
import { throwError } from 'src/common/utils';
import * as bcrypt from 'bcryptjs';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { randomBytes } from 'crypto';
import { EmailsService } from 'src/emails/emails.service';
import { ConfigService } from '@nestjs/config';
import {
  accountCreatedSubject,
  resetPasswordSubject,
} from 'src/common/translations';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private scheduleRegistry: SchedulerRegistry,
    private readonly emailsService: EmailsService,
    private readonly configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  async register(registerDTO: RegisterDTO) {
    const existingUser = await this.usersService.findByEmail(registerDTO.email);

    if (existingUser) {
      throwError(
        HttpStatus.CONFLICT,
        'User exist',
        'User with this email already exists',
      );
    }

    const hashed = await bcrypt.hash(registerDTO.password, 10);

    const emailVerificationToken = randomBytes(32).toString('hex');

    const user = await this.usersService.create({
      ...registerDTO,
      password: hashed,
      emailVerificationToken,
    });

    const jobName = `emailVerificationToken-${user.id}`;
    if (this.scheduleRegistry.doesExist('cron', jobName)) {
      this.scheduleRegistry.deleteCronJob(jobName);
    }
    const job = new CronJob(CronExpression.EVERY_DAY_AT_MIDNIGHT, async () => {
      user.emailVerificationToken = null;
      await this.usersService.update(user.id, user);
    });

    this.scheduleRegistry.addCronJob(jobName, job);
    job.start();

    const lang = registerDTO.lang || 'en';

    await this.emailsService.send(
      [registerDTO.email],
      lang === 'en' ? accountCreatedSubject.en : accountCreatedSubject.uk,
      lang === 'en' ? '/auth/register-en' : '/auth/register-uk',
      {
        link: `${this.configService.get<string>('LENDING_URL')}/email-confirmation?token=${emailVerificationToken}`,
      },
    );

    return true;
  }

  async emailConfirmation(token: string) {
    const user = await this.usersService.findByEmailVerificationToken(token);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid token',
        'The provided token is invalid or has expired.',
      );
    }

    user!.emailVerified = true;
    user!.emailVerificationToken = null;

    await this.usersService.update(user!.id, user!);

    return { message: 'Email verified successfully.' };
  }

  async login(loginDTO: LoginDTO) {
    const user = await this.usersService.findByEmail(loginDTO.email);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this email does not exist.',
      );
    }

    if (!user!.emailVerified) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Email not verified',
        'Please verify your email first.',
      );
    }

    if (!user!.password) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Password not set',
        'Please set your password first.',
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

    console.log('accessToken', accessToken);

    return {
      accessToken,
      user: {
        id: user!.id,
        email: user!.email,
        name: user!.name,
      },
    };
  }

  async loginByUUID(uuid: string) {
    const user = await this.usersService.findByUUID(uuid);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this UUID does not exist.',
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
      user: {
        id: user!.id,
        uuid: user!.uuid,
      },
    };
  }

  async resetPassword(resetPasswordDTO: ResetPasswordDTO) {
    const user = await this.usersService.findByEmail(resetPasswordDTO.email);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this email does not exist.',
      );
    }

    const resetToken = randomBytes(32).toString('hex');

    user!.passwordResetToken = resetToken;

    await this.usersService.update(user!.id, user!);

    const jobName = `resetPassword-${user!.id}`;
    if (this.scheduleRegistry.doesExist('cron', jobName)) {
      this.scheduleRegistry.deleteCronJob(jobName);
    }
    const job = new CronJob(CronExpression.EVERY_HOUR, async () => {
      user!.passwordResetToken = null;
      await this.usersService.update(user!.id, user!);
    });

    this.scheduleRegistry.addCronJob(jobName, job);
    job.start();

    const lang = resetPasswordDTO.lang || 'en';

    if (!user!.email) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Email not found',
        'User does not have an email associated with their account.',
      );
    }

    await this.emailsService.send(
      [user!.email as string],
      lang === 'en' ? resetPasswordSubject.en : resetPasswordSubject.uk,
      lang === 'en' ? '/auth/reset-password-en' : '/auth/reset-password-uk',
      {
        link: `${this.configService.get<string>('FRONT_BASE_URL')}/reset-password?token=${resetToken}`,
      },
    );

    return { message: 'Reset password email sent successfully.' };
  }

  // async logout() {
  //
  //
  //   return { message: 'Logged out successfully' };
  // }

  // async changePassword(changePasswordDTO: any) {
  //   // Implement password change logic here
  //   return this.usersService.updatePassword(changePasswordDTO);
  // }
}

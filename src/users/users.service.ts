import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UniqueId } from './entities/unique-id.entity';
import { Repository, In } from 'typeorm';
import { AuthService } from 'src/auth/auth.service';
import { throwError } from '../common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import * as bcrypt from 'bcryptjs';
import { PaymentsService } from 'src/payments/payments.service';
import { TokensService } from 'src/tokens/tokens.service';
import { PlansService } from 'src/plans/plans.service';
import { SaltService } from 'src/salt/salt.service';
import { generateHash } from 'src/common/utils/generateHash';
import { ChangeUserAuthDataDto } from './dto/change-user-auth-data.dto';
import { emailChangeSubject } from '../common/translations';
import { EmailsService } from 'src/emails/emails.service';
import { UserSettings } from './entities/user-settings.entity';
import { Lang, Theme } from './types';
import { sleep } from 'src/common/utils/crypto';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { Platform } from '../common/types/platform';
import { ReleaseNotificationsService } from 'src/notifications/release-notifications.service';
import { CommonNotificationsService } from 'src/notifications/common-notifications.service';
import { Plan } from 'src/plans/entities/plan.entity';
import { SessionsService } from 'src/auth/sessions.service';

export type SendDeleteCodeResult =
  | { status: 'SENT' }
  | { status: 'COOLDOWN'; retryAfterSec: number };

export type VerifyDeleteCodeResult =
  | { status: 'OK' }
  | { status: 'INVALID_CODE' }
  | { status: 'EXPIRED_CODE' }
  | { status: 'ATTEMPTS_EXCEEDED' }
  | { status: 'RATE_LIMITED' };

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private usersSettingsRepository: Repository<UserSettings>,
    @InjectRepository(UniqueId)
    private uniqueIdRepository: Repository<UniqueId>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly paymentsService: PaymentsService,
    private readonly tokensService: TokensService,
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
    private readonly saltService: SaltService,
    private readonly emailsService: EmailsService,
    private readonly codeCore: CodeCoreService,
    private readonly releaseNotificationsService: ReleaseNotificationsService,
    private readonly commonNotificationsService: CommonNotificationsService,
    private readonly sessionsService: SessionsService,
  ) {}

  async createUserByUUID(
    uuid: string,
    lang: Lang,
    theme: Theme,
    platform: Platform,
    regionCode: string,
    devicePubKey: string,
    appVersion: string,
    appBuild: number,
    locale: string,
    model: string,
    osVersion: string,
    osBuildId: string,
    uniqueId: string | null,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<{
    accessToken: string;
    user: User | null;
  }> {
    let isFirstInstall: boolean = true;

    if (uniqueId) {
      const findUserByUniqueId = await this.uniqueIdRepository.findOne({
        where: { uniqueId },
      });

      if (!findUserByUniqueId) {
        const newUniqueId = this.uniqueIdRepository.create({ uniqueId });
        await this.uniqueIdRepository.save(newUniqueId);
      }

      isFirstInstall = !findUserByUniqueId;
    }

    const saltValue = this.saltService.generateSalt();

    const hash = generateHash(uuid, saltValue);

    const user = this.usersRepository.create({
      uuid,
      hash,
      regionCode: regionCode || '',
    });
    const savedUser = await this.usersRepository.save(user);

    await this.saltService.saveSalt(savedUser.id, saltValue);

    const settings = this.usersSettingsRepository.create({
      lang,
      theme,
      user: savedUser,
      platform,
      appVersion,
      appBuild,
      locale,
      model,
      osVersion,
      osBuildId,
      uniqueId,
    });

    savedUser.settings = await this.usersSettingsRepository.save(settings);

    await this.usersRepository.save(savedUser);

    return await this.authService.loginByUUID(
      uuid,
      devicePubKey,
      isFirstInstall,
      userAgent,
      ip,
    );
  }

  async me(
    uuid: string,
    hash: string,
  ): Promise<{
    user: User | null;
    plan: Plan | null;
    settings: UserSettings | null;
  }> {
    const user = await this.usersRepository.findOne({
      where: { uuid },
    });

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
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
    }

    const { plan } = await this.plansService.getActualByUserId(user.id);

    const settings = await this.getUserSettings(user.id);

    return {
      user,
      plan,
      settings,
    };
  }

  async findByEmail(
    email: User['email'],
    relations: any[] = [],
  ): Promise<User | null> {
    if (!email) return null;
    return await this.usersRepository.findOne({
      where: { email },
      relations: relations,
    });
  }

  async findByNewEmail(
    newEmail: string,
    relations: any[] = [],
  ): Promise<User | null> {
    if (!newEmail) return null;
    return await this.usersRepository.findOne({
      where: { newEmail },
      relations: relations,
    });
  }

  async findById(id: number, relations: any[] = []): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { id },
      relations: relations,
    });
  }

  async findByUUID(uuid: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { uuid },
    });
  }

  async getUserSettings(userId: number): Promise<UserSettings | null> {
    const settings = await this.usersSettingsRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!settings) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User settings not found',
        'User settings not found',
        'USER_SETTINGS_NOT_FOUND',
      );
      return null;
    }

    return settings;
  }

  async verifyUser(
    email: User['email'],
    password: string,
    hash?: string,
  ): Promise<User | null> {
    const user = await this.findByEmail(email);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    if (hash !== user.hash) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid hash',
        'The provided hash is invalid.',
        'INVALID_HASH',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password as string,
    );

    if (!isPasswordValid) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid password',
        'Invalid password',
        'INVALID_PASSWORD',
      );
    }

    return user;
  }

  async changeUserAuthData(changeUserAuthDataDto: ChangeUserAuthDataDto) {
    const { email, password, hash, ...rest } = changeUserAuthDataDto;

    const user = await this.verifyUser(email, password, hash);
    const data: Partial<User> = {};

    if (rest.newPassword) {
      data.password = await bcrypt.hash(rest.newPassword, 10);
    }

    let status: 'COOLDOWN' | 'SENT' = 'SENT';
    let retryAfterSec: number | undefined = undefined;
    if (rest.newEmail) {
      const existingUser = await this.findByEmail(rest.newEmail);

      if (existingUser && existingUser.id !== user!.id) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User already exists',
          'USER_ALREADY_EXISTS',
          'USER_ALREADY_EXISTS',
        );
      }

      data.newEmail = rest.newEmail;

      const {
        status: st,
        code,
        retryAfterSec: ra,
      } = await this.codeCore.send('email_change', { email: email });

      if (st === 'COOLDOWN') {
        status = st;
        retryAfterSec = ra;

        return { user: null, status, retryAfterSec };
      }

      const lang = rest.lang || 'en';
      await this.emailsService.send(
        [rest.newEmail],
        lang === 'en' ? emailChangeSubject.en : emailChangeSubject.uk,
        lang === 'en' ? '/auth/email-change-en' : '/auth/email-change-uk',
        { code },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repo = this.usersRepository as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await repo.update(user!.id, data);
    const updatedUser = await this.usersRepository.findOne({
      where: { id: user!.id },
    });

    return { user: updatedUser, status, retryAfterSec };
  }

  // async changeUser(changeUserDto: ChangeUserDto) {
  //   const { uuid, hash, ...rest } = changeUserDto;
  //   const user = await this.findByUUID(uuid);
  //
  //   if (!user) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'User not found',
  //       'User with this UUID does not exist.',
  //       'USER_NOT_FOUND',
  //     );
  //   }
  //
  //   const salt = await this.saltService.getSaltByUserId(user.id);
  //   const hashToCompare = generateHash(uuid, salt!.value);
  //
  //   if (hash !== hashToCompare) {
  //     throwError(
  //       HttpStatus.UNAUTHORIZED,
  //       'Invalid hash',
  //       'The provided hash is invalid.',
  //       'INVALID_HASH',
  //     );
  //   }
  //   const data: Partial<User> = {};
  //
  //   if (rest.newName) {
  //     data.name = rest.newName;
  //   }
  //
  //   await this.usersRepository.update(user.id, data);
  //   return await this.usersRepository.findOne({
  //     where: { id: user.id },
  //   });
  // }

  async update(
    uuid: string,
    updateUserDto: Partial<User> & { appVersion?: string; appBuild?: number },
  ): Promise<{ user: User }> {
    console.log('updateUserDto service', updateUserDto);
    const { hash, appVersion, appBuild, ...rest } = updateUserDto;
    try {
      const user = await this.findByUUID(uuid);

      if (!user) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found',
          'User with this UUID does not exist.',
          'USER_NOT_FOUND',
        );
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
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const repo = this.usersRepository as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,  @typescript-eslint/no-unsafe-member-access
      const res = await repo.update(user.id, rest);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!res.affected) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Error updating user',
          'Error updating user',
          'USER_UPDATE_ERROR',
        );
      }

      if (appVersion && appBuild) {
        await this.usersSettingsRepository.update(
          { user: { id: user.id } },
          { appVersion, appBuild },
        );
      }

      const updatedUser = await this.usersRepository.findOne({
        where: { id: user.id },
      });

      if (!updatedUser) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found after update',
          'User not found after update',
          'USER_NOT_FOUND_AFTER_UPDATE',
        );
      }

      return {
        user: updatedUser,
      };
    } catch (error: any) {
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'User update error',
        'An error occurred while updating the user.',
        'USER_UPDATE_ERROR',
        error,
      );
    }
  }

  async updateByIdAndUuid(
    id: number,
    uuid: string,
    updateUserDto: Partial<User>,
  ): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id, uuid });

    const { plans, settings, ...rest } = updateUserDto;

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this ID and UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repo = this.usersRepository as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await repo.update(user.id, rest);
    return await this.usersRepository.findOne({
      where: { id: user.id },
    });
  }

  async updateUserSettings(
    userId: number,
    updateUserSettingsDto: Partial<UserSettings>,
  ): Promise<UserSettings | null> {
    const settings = await this.usersSettingsRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!settings) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User settings not found',
        'User settings not found',
        'USER_SETTINGS_NOT_FOUND',
      );
    }

    Object.assign(settings, updateUserSettingsDto);

    return await this.usersSettingsRepository.save(settings);
  }

  async sendVerificationCodeForDelete(
    email: string,
  ): Promise<SendDeleteCodeResult> {
    const user = await this.findByEmail(email);

    if (!user) {
      await sleep(200 + Math.random() * 200);
      return { status: 'SENT' };
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'delete_account',
      { email: email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = user.settings?.lang || 'en';

    await this.emailsService.send(
      [user.email as string],
      lang === Lang.EN
        ? 'Code to delete account'
        : 'Код для видалення облікового запису',
      lang === Lang.EN ? '/auth/delete-account-en' : '/auth/delete-account-uk',
      {
        code: code,
      },
    );

    return { status: 'SENT' };
  }

  async sendVerificationCodeForResetPin(
    email: string,
  ): Promise<SendDeleteCodeResult> {
    const user = await this.findByEmail(email);

    if (!user) {
      await sleep(200 + Math.random() * 200);
      return { status: 'SENT' };
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'reset_pin',
      { email: email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = user.settings?.lang || 'en';

    await this.emailsService.send(
      [user.email as string],
      lang === Lang.EN ? 'Code to reset PIN' : 'Код для скидання PIN-коду',
      lang === Lang.EN ? '/auth/reset-pin-en' : '/auth/reset-pin-uk',
      {
        code: code,
      },
    );

    return { status: 'SENT' };
  }

  async checkCodeForResetPin(email: string, code: string): Promise<boolean> {
    const v = await this.codeCore.verify('reset_pin', { email: email }, code);

    if (v.status !== 'OK') {
      const msg =
        v.status === 'EXPIRED_CODE'
          ? 'The provided code has expired.'
          : v.status === 'ATTEMPTS_EXCEEDED'
            ? 'Maximum attempts exceeded.'
            : 'The provided code is invalid.';
      throwError(HttpStatus.BAD_REQUEST, 'Invalid code', msg, v.status);
    }

    return v.status === 'OK';
  }

  async deleteAccountByVerificationCode(
    email: string,
    code: string,
  ): Promise<VerifyDeleteCodeResult> {
    const v = await this.codeCore.verify(
      'delete_account',
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

    const user = await this.findByEmail(email);

    if (!user) {
      await sleep(250);
      return { status: 'INVALID_CODE' };
    }

    await this.deleteUser(user.id);

    const lang = user.settings?.lang || 'en';

    await this.emailsService.send(
      [user.email as string],
      lang === Lang.EN ? 'Account deleted' : 'Акаутн видалено',
      lang === Lang.EN
        ? '/auth/account-deleted-en'
        : '/auth/account-deleted-uk',
    );
    return { status: 'OK' };
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    await this.tokensService.deleteByUserId(user.id);

    await this.plansService.deleteByUserId(user.id);

    await this.saltService.deleteSaltByUserId(user.id);

    await this.sessionsService.deleteByUserId(user.id);

    await this.commonNotificationsService.deleteReadNotificationsByUserId(
      user.id,
    );
    await this.releaseNotificationsService.deleteSkippedVersionsByUserId(
      user.id,
    );
    await this.usersSettingsRepository.delete({ user: { id: user.id } });

    await this.usersRepository.delete(id);
  }

  async deleteUserByUuid(uuid: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { uuid } });

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    await this.deleteUser(user.id);
  }
}

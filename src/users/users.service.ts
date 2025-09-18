import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository, In } from 'typeorm';
import { CreateUserDto } from './dto';
import { AuthService } from 'src/auth/auth.service';
import { throwError } from '../common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import * as bcrypt from 'bcryptjs';
import { ChangeUserDto } from './dto/change-user.dto';
import { PaymentsService } from 'src/payments/payments.service';
import { TokensService } from 'src/tokens/tokens.service';
import { PlansService } from 'src/plans/plans.service';
import { DiaryService } from 'src/diary/diary.service';
import { SaltService } from 'src/salt/salt.service';
import { generateHash } from 'src/common/utils/generateHash';
import { ChangeUserAuthDataDto } from './dto/change-user-auth-data.dto';
import { emailChangeSubject } from '../common/translations';
import { EmailsService } from 'src/emails/emails.service';
import { UserSettings } from './entities/user-settings.entity';
import { Lang, Theme } from './types';
import { sleep } from 'src/common/utils/crypto';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { DiaryEntry } from '../diary/entities/diary.entity';
import { Platform } from '../common/types/platform';
import { ReleaseNotificationsService } from 'src/notifications/release-notifications.service';

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
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly paymentsService: PaymentsService,
    private readonly tokensService: TokensService,
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
    @Inject(forwardRef(() => DiaryService))
    private readonly diaryService: DiaryService,
    private readonly saltService: SaltService,
    private readonly emailsService: EmailsService,
    private readonly codeCore: CodeCoreService,
    private readonly releaseNotificationsService: ReleaseNotificationsService,
  ) {}

  async createUserByUUID(
    uuid: string,
    lang: Lang,
    theme: Theme,
    platform: Platform,
  ): Promise<{
    accessToken: string;
    user: User | null;
  }> {
    const saltValue = this.saltService.generateSalt();

    const hash = generateHash(uuid, saltValue);

    const user = this.usersRepository.create({
      uuid,
      hash,
      platform,
    });
    const savedUser = await this.usersRepository.save(user);

    await this.saltService.saveSalt(savedUser.id, saltValue);

    const settings = this.usersSettingsRepository.create({
      lang,
      theme,
      user: savedUser,
    });

    savedUser.settings = await this.usersSettingsRepository.save(settings);

    await this.usersRepository.save(savedUser);

    return await this.authService.loginByUUID(uuid);
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

  async findByPhone(
    phone: User['phone'],
    relations: any[] = [],
  ): Promise<User | null> {
    if (!phone) return null;
    return await this.usersRepository.findOne({
      where: { phone },
      relations: relations,
    });
  }

  async findById(id: number): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { id },
      relations: ['plan', 'settings'],
    });
  }

  async findByUUID(uuid: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { uuid },
      relations: ['plan', 'settings'],
    });
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    return await this.usersRepository.save(createUserDto);
  }

  async findByEmailVerificationCode(
    emailVerificationCode: string,
  ): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { emailVerificationCode },
    });
  }

  async findByNewEmailVerificationCode(
    newEmailVerificationCode: string,
  ): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { newEmailVerificationCode },
    });
  }

  async findByPasswordResetCode(
    passwordResetCode: string,
  ): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { passwordResetCode },
    });
  }

  async verifyUser(
    email: User['email'],
    password: string,
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

    const isPasswordValid = await bcrypt.compare(
      password,
      user!.password as string,
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
    const { email, password, ...rest } = changeUserAuthDataDto;

    const user = await this.verifyUser(email, password);
    const data: Partial<User> = {};

    if (rest.newPassword) {
      data.password = await bcrypt.hash(rest.newPassword, 10);
    }

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

      const { status, code, retryAfterSec } = await this.codeCore.send(
        'email_change',
        { email: rest.newEmail },
      );
      if (status === 'COOLDOWN') return { status, retryAfterSec };

      const lang = rest.lang || 'en';
      await this.emailsService.send(
        [rest.newEmail],
        lang === 'en' ? emailChangeSubject.en : emailChangeSubject.uk,
        lang === 'en' ? '/auth/email-change-en' : '/auth/email-change-uk',
        { code },
      );
    }

    await this.usersRepository.update(user!.id, data);
    return this.usersRepository.findOne({
      where: { id: user!.id },
      relations: ['plan', 'settings'],
    });
  }

  async changeUser(changeUserDto: ChangeUserDto) {
    const { uuid, hash, ...rest } = changeUserDto;
    const user = await this.findByUUID(uuid);

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
    const data: Partial<User> = {};

    if (rest.newName) {
      data.name = rest.newName;
    }

    await this.usersRepository.update(user.id, data);
    return await this.usersRepository.findOne({
      where: { id: user.id },
      relations: ['plan', 'settings'],
    });
  }

  async findByPhoneVerificationCode(
    phoneVerificationCode: string,
  ): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { phoneVerificationCode },
    });
  }

  async update(id: number, updateUserDto: Partial<User>): Promise<User | null> {
    await this.usersRepository.update(id, updateUserDto);
    return this.usersRepository.findOne({
      where: { id: id },
      relations: ['plan', 'settings'],
    });
  }

  async updateByIdAndUuid(
    id: number,
    uuid: string,
    updateUserDto: Partial<User>,
  ): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id, uuid });

    const { plan, settings, ...rest } = updateUserDto;

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this ID and UUID does not exist.',
        'USER_NOT_FOUND',
      );
      return null;
    }

    await this.usersRepository.update(user.id, rest);
    return await this.usersRepository.findOne({
      where: { id: user.id },
      relations: ['plan', 'settings'],
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
      return null;
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

    const user = await this.findByEmail(email, ['settings']);

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

    await this.paymentsService.deleteByUserId(user.id);

    await this.tokensService.deleteByUserId(user.id);

    await this.plansService.deleteByUserId(user.id);

    await this.diaryService.deleteByUserId(user.id);

    await this.saltService.deleteSaltByUserId(user.id);

    await this.usersSettingsRepository.delete({ user: { id: user.id } });

    await this.releaseNotificationsService.deleteSkippedVersion(user.id);

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

  async getUsersEntriesForStatistics() {
    const entryRows = await this.diaryService.getEntriesForStatistics();

    const dialogRows = await this.diaryService.getDialogsForStatistics();

    type DayAgg = Record<string, { entries: number; dialogs: number }>;
    const perUser = new Map<number, DayAgg>();

    for (const r of entryRows) {
      const uid = Number(r.user_id);
      const key = r.day_key as string; // '16.09.2025'
      const cnt = Number(r.entries_count);
      if (!perUser.has(uid)) perUser.set(uid, {});
      const m = perUser.get(uid)!;
      if (!m[key]) m[key] = { entries: 0, dialogs: 0 };
      m[key].entries += cnt;
    }

    for (const r of dialogRows) {
      const uid = Number(r.user_id);
      if (!perUser.has(uid)) continue;
      const key = r.day_key as string;
      const cnt = Number(r.dialogs_count);
      const m = perUser.get(uid)!;
      if (!m[key]) m[key] = { entries: 0, dialogs: 0 };
      m[key].dialogs += cnt;
    }

    // далі тягнеш користувачів і формуєш відповідь
    const userIds = [...perUser.keys()];
    const users = await this.usersRepository.findBy({ id: In(userIds) });
    const userById = new Map(users.map((u) => [u.id, u]));

    const out = userIds.map((uid) => ({
      user: userById.get(uid)!,
      entries: perUser.get(uid)!,
    }));
    return out;
  }
}

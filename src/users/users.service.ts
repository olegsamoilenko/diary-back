import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto';
import { AuthService } from 'src/auth/auth.service';
import { throwError } from '../common/utils';
import { Plan } from '../plans/entities/plan.entity';
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
import { SchedulerRegistry } from '@nestjs/schedule';
import { EmailsService } from 'src/emails/emails.service';
import { UserSettings } from './entities/user-settings.entity';

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
    private scheduleRegistry: SchedulerRegistry,
    private readonly emailsService: EmailsService,
  ) {}

  async createUserByUUID(uuid: string): Promise<{
    accessToken: string;
    user: User | null;
  }> {
    const saltValue = this.saltService.generateSalt();

    const hash = generateHash(uuid, saltValue);

    const user = this.usersRepository.create({ uuid, hash });
    const savedUser = await this.usersRepository.save(user);

    await this.saltService.saveSalt(savedUser.id, saltValue);

    const settings = this.usersSettingsRepository.create({
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

      const code = Math.floor(100000 + Math.random() * 900000).toString();

      data.newEmail = rest.newEmail;
      data.newEmailVerificationCode = code;

      const jobName = `emailVerificationCode-${user!.id}`;
      if (this.scheduleRegistry.doesExist('timeout', jobName)) {
        this.scheduleRegistry.deleteTimeout(jobName);
      }

      const timeout = setTimeout(
        () => {
          void (async () => {
            const actualUser = await this.findById(user!.id);
            if (actualUser?.newEmailVerificationCode) {
              actualUser.newEmailVerificationCode = null;
              await this.usersRepository.update(user!.id, actualUser);
            }
          })();
        },
        5 * 60 * 1000,
      );

      this.scheduleRegistry.addTimeout(jobName, timeout);

      const lang = rest.lang || 'en';

      await this.emailsService.send(
        [rest.newEmail],
        lang === 'en' ? emailChangeSubject.en : emailChangeSubject.uk,
        lang === 'en' ? '/auth/email-change-en' : '/auth/email-change-uk',
        {
          code: code,
        },
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

    await this.usersRepository.delete(id);
  }

  async deleteUserByUuid(uuid: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { uuid } });
    console.log('user to delete', user);
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

    await this.usersRepository.delete(user.id);
  }
}

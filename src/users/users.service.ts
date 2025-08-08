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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly paymentsService: PaymentsService,
    private readonly tokensService: TokensService,
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
    @Inject(forwardRef(() => DiaryService))
    private readonly diaryService: DiaryService,
    private readonly saltService: SaltService,
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
      relations: ['plan'],
    });
  }

  async findByUUID(uuid: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { uuid },
      relations: ['plan'],
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

  async changeUser(changeUserDto: ChangeUserDto) {
    const { email, password, ...rest } = changeUserDto;

    const user = await this.verifyUser(email, password);
    const data: Partial<User> = {};

    if (rest.newPassword) {
      data.password = await bcrypt.hash(rest.newPassword, 10);
    }

    if (rest.newName) {
      data.name = rest.newName;
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

      data.email = rest.newEmail;
    }

    await this.usersRepository.update(user!.id, data);
    return this.usersRepository.findOne({
      where: { id: user!.id },
      relations: ['plan'],
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
    return this.usersRepository.findOneBy({ id });
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

    await this.usersRepository.delete(id);
  }
}

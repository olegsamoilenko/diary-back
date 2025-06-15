import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto';
import { AuthService } from 'src/auth/auth.service';
import { throwError } from '../common/utils';
import { Plan } from '../plans/entities/plan.entity';
import { HttpStatus } from 'src/common/utils/http-status';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  async createUserByUUID(uuid: string): Promise<{
    accessToken: string;
    user: User | null;
  }> {
    const user = this.usersRepository.create({ uuid });
    await this.usersRepository.save(user);

    return this.authService.loginByUUID(uuid);
  }

  async findByEmail(email: User['email']): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { email },
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

  async findByEmailVerificationToken(
    emailVerificationToken: string,
  ): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { emailVerificationToken },
    });
  }

  async update(id: number, updateUserDto: Partial<User>): Promise<User | null> {
    await this.usersRepository.update(id, updateUserDto);
    return this.usersRepository.findOneBy({ id });
  }
}

import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Salt } from './entities/salt.entity';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

@Injectable()
export class SaltService {
  constructor(
    @InjectRepository(Salt)
    private readonly saltRepository: Repository<Salt>,
  ) {}
  generateSalt(): string {
    return randomBytes(16).toString('hex');
  }

  async saveSalt(userId: number, salt: string) {
    const createdSalt = this.saltRepository.create({
      value: salt,
      user: { id: userId },
    });

    await this.saltRepository.save(createdSalt);
  }

  async getSaltByUserId(userId: number): Promise<Salt | null> {
    return this.saltRepository.findOne({
      where: { user: { id: userId } },
    });
  }

  async deleteSaltByUserId(userId: number): Promise<void> {
    await this.saltRepository.delete({ user: { id: userId } });
  }
}

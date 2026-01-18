import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from './entities/admin.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
  ) {}

  // async createSuperAdmin(
  //   name: string,
  //   email: string,
  //   password: string,
  // ): Promise<Admin> {}

  async findByEmail(email: string): Promise<Admin | null> {
    return this.adminRepository.findOne({ where: { email } });
  }

  async findById(id: number): Promise<Admin | null> {
    return this.adminRepository.findOne({ where: { id } });
  }
}

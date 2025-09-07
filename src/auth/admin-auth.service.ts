import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminsService } from 'src/admins/admins.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { Admin } from '../admins/entities/admin.entity';
import * as bcrypt from 'bcryptjs';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { AdminRole } from '../admins/types';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private jwtService: JwtService,
  ) {}

  async login(adminLoginDto: AdminLoginDto): Promise<string> {
    const admin = await this.adminsService.findByEmail(adminLoginDto.email);
    if (!admin) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Admin not found',
        'Admin with this email does not exist.',
        'ADMIN_NOT_FOUND',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      adminLoginDto.password,
      admin!.password,
    );
    if (!isPasswordValid) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid password',
        'The password you entered is incorrect.',
        'INVALID_PASSWORD',
      );
    }

    const role: AdminRole = admin!.role;

    const active = admin!.active;

    const payload = {
      id: String(admin!.id),
      email: admin!.email,
      role,
      type: 'admin',
      active,
    };

    return this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_ADMIN_TOKEN_TTL || '30d',
    });
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Post('create-by-uuid')
  async createUserByUUID(@Body() data: { uuid: string }) {
    return await this.usersService.createUserByUUID(data.uuid);
  }
}

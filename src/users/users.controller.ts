import { Body, Controller, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Post('create-by-uuid')
  async createUserByUUID(@Body() data: { uuid: string }) {
    return await this.usersService.createUserByUUID(data.uuid);
  }

  @Post('update/:id')
  async updateUser(
    @Param('id') id: number,
    @Body() updateUserDto: Partial<User>,
  ) {
    return await this.usersService.update(id, updateUserDto);
  }
}

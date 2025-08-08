import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { ChangeUserDto } from './dto/change-user.dto';

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

  @Post('change')
  async changeUser(@Body() changeUserDto: ChangeUserDto) {
    return await this.usersService.changeUser(changeUserDto);
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: number) {
    return await this.usersService.deleteUser(Number(id));
  }
}

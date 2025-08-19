import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { ChangeUserDto } from './dto/change-user.dto';
import { ChangeUserAuthDataDto } from './dto/change-user-auth-data.dto';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { UserSettings } from './entities/user-settings.entity';
import { AuthGuard } from '@nestjs/passport';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Post('create-by-uuid')
  async createUserByUUID(@Body() data: { uuid: string }) {
    return await this.usersService.createUserByUUID(data.uuid);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('update/:id')
  async updateUser(
    @Param('id') id: number,
    @Body() updateUserDto: Partial<User>,
  ) {
    return await this.usersService.update(id, updateUserDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('update-settings')
  async updateUserSettings(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() updateUserSettingsDto: Partial<UserSettings>,
  ) {
    return await this.usersService.updateUserSettings(
      user.id,
      updateUserSettingsDto,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change')
  async changeUser(@Body() changeUserDto: ChangeUserDto) {
    return await this.usersService.changeUser(changeUserDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-user-auth-data')
  async changeUserAuthData(@Body() changeAuthDataDto: ChangeUserAuthDataDto) {
    return await this.usersService.changeUserAuthData(changeAuthDataDto);
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: number) {
    return await this.usersService.deleteUser(Number(id));
  }
}

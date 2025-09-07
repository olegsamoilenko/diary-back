import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Ip,
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
import { Lang, Theme } from './types';
import { Throttle, ThrottlerGuard, seconds } from '@nestjs/throttler';

@UseGuards(ThrottlerGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Post('create-by-uuid')
  async createUserByUUID(
    @Body() data: { uuid: string; lang: Lang; theme: Theme },
  ) {
    return await this.usersService.createUserByUUID(
      data.uuid,
      data.lang,
      data.theme,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('update')
  async updateUser(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() updateUserDto: Partial<User>,
  ) {
    return await this.usersService.update(user.id, updateUserDto);
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
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async changeUserAuthData(@Body() changeAuthDataDto: ChangeUserAuthDataDto) {
    return await this.usersService.changeUserAuthData(changeAuthDataDto);
  }

  @Post('send-verification-code-for-delete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async sendVerificationCodeForDelete(@Body() body: { email: string }) {
    return await this.usersService.sendVerificationCodeForDelete(body.email);
  }

  @Post('delete-account-by-verification-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  async deleteAccountByVerificationCode(
    @Body() body: { email: string; code: string },
  ) {
    return await this.usersService.deleteAccountByVerificationCode(
      body.email,
      body.code,
    );
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: number) {
    return await this.usersService.deleteUser(Number(id));
  }
}

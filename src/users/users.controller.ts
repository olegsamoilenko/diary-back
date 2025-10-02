import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Req,
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
import { Platform } from 'src/common/types/platform';
import { Request } from 'express';
import { CustomThrottlerGuard } from 'src/common/guards/custom-throttler.guard';

@UseGuards(CustomThrottlerGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('me')
  async getMe(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() data: { hash: string },
  ) {
    if (!user) return null;
    return await this.usersService.me(user.uuid, data.hash);
  }

  @Post('create-by-uuid')
  async createUserByUUID(
    @Body()
    data: {
      uuid: string;
      lang: Lang;
      theme: Theme;
      platform: Platform;
      regionCode: string;
      devicePubKey: string;
    },
    @Req() req: Request,
  ) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;
    return await this.usersService.createUserByUUID(
      data.uuid,
      data.lang,
      data.theme,
      data.platform,
      data.regionCode,
      data.devicePubKey,
      ua,
      ip,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('update')
  async updateUser(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() updateUserDto: Partial<User>,
  ) {
    return await this.usersService.update(user.uuid, updateUserDto);
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

  // @UseGuards(AuthGuard('jwt'))
  // @Post('change')
  // async changeUser(@Body() changeUserDto: ChangeUserDto) {
  //   return await this.usersService.changeUser(changeUserDto);
  // }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-user-auth-data')
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async changeUserAuthData(@Body() changeAuthDataDto: ChangeUserAuthDataDto) {
    return await this.usersService.changeUserAuthData(changeAuthDataDto);
  }

  @Post('send-verification-code-for-delete')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async sendVerificationCodeForDelete(@Body() body: { email: string }) {
    return await this.usersService.sendVerificationCodeForDelete(body.email);
  }

  @Post('delete-account-by-verification-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
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

  @Get('get-users-entries-for-statistics')
  async getUsersEntriesForStatistics() {
    return await this.usersService.getUsersEntriesForStatistics();
  }
}

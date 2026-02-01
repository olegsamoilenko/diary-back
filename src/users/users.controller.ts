import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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
import { AiModel, Lang, Role, Theme } from './types';
import { Throttle, seconds } from '@nestjs/throttler';
import { Platform } from 'src/common/types/platform';
import { Request } from 'express';

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
      iaModel: AiModel;
      regionCode: string;
      devicePubKey: string;
      deviceId?: string | null;
      appVersion: string;
      appBuild: number;
      platform: Platform;
      locale: string;
      firstDayOfWeek: number;
      model: string;
      osVersion: string;
      osBuildId: string;
      uniqueId: string | null;
      acquisitionSource: string | null;
    },
    @Req() req: Request,
  ) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;
    return await this.usersService.createUserByUUID(
      data.uuid,
      data.lang,
      data.theme,
      data.iaModel,
      data.platform,
      data.regionCode,
      data.devicePubKey,
      data.deviceId ?? null,
      data.appVersion,
      Number(data.appBuild),
      data.locale,
      data.firstDayOfWeek,
      data.model,
      data.osVersion,
      data.osBuildId,
      data.uniqueId,
      data.acquisitionSource,
      ua,
      ip,
    );
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post('get-one-by')
  async getOneBy(@Body() body: { email?: string; uuid?: string }) {
    const user = await this.usersService.getOneBy(body.email, body.uuid);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('get-all')
  getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: 'dialog' | 'entry',
  ) {
    return this.usersService.getUsersWithStats({
      page: Number(page ?? 1),
      limit: Number(limit ?? 50),
      sortBy: sortBy === 'entry' ? 'entry' : 'dialog',
    });
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post('change-user-role')
  async changeUserRole(
    @Body() body: { uuid: string; hash: string; role: User['role'] },
  ) {
    return await this.usersService.update(body.uuid, {
      hash: body.hash,
      role: body.role,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('update')
  async updateUser(
    @ActiveUserData() user: ActiveUserDataT,
    @Body()
    updateUserDto: Partial<User> & { appVersion?: string; appBuild?: number },
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
  async changeUserAuthData(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() changeAuthDataDto: ChangeUserAuthDataDto,
  ) {
    return await this.usersService.changeUserAuthData(
      user.email,
      changeAuthDataDto,
    );
  }

  @Post('send-verification-code-for-delete')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async sendVerificationCodeForDelete(@Body() body: { email: string }) {
    return await this.usersService.sendVerificationCodeForDelete(body.email);
  }

  @Post('send-verification-code-for-reset-pin')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async sendVerificationCodeForResetPin(@Body() body: { email: string }) {
    return await this.usersService.sendVerificationCodeForResetPin(body.email);
  }

  @Post('check-code-for-reset-pin')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async checkCodeForResetPin(@Body() body: { email: string; code: string }) {
    return await this.usersService.checkCodeForResetPin(body.email, body.code);
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
}

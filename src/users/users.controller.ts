import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  ParseIntPipe,
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
import { UpdateUserDto } from './dto/update-user.dto';
import { SyncUserDto } from './dto/sync-user.dto';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { UserSettings } from './entities/user-settings.entity';
import { AuthGuard } from '@nestjs/passport';
import {
  AcquisitionMetaJson,
  AiModel,
  HasPlan,
  Lang,
  Role,
  SortBy,
  Theme,
} from './types';
import { Throttle, seconds } from '@nestjs/throttler';
import { Platform } from 'src/common/types/platform';
import { Request } from 'express';
import { ParseHasPlanPipe } from './utils';
import { CreatePlanDto } from '../plans/dto';
import { BlockedCountriesGuard } from 'src/common/geo-access/blocked-countries.guard';
import { GeoAccessService } from 'src/common/geo-access/geo-access.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { AdminRole } from '../admins/types';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly geoAccessService: GeoAccessService,
  ) {}

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
  @UseGuards(BlockedCountriesGuard)
  async createUserByUUID(
    @Body()
    data: {
      uuid: string;
      lang: Lang;
      theme: Theme;
      aiModel: AiModel;
      regionCode: string;
      devicePubKey: string;
      deviceId?: string | null;
      appVersion: string;
      appBuild: number;
      platform: Platform;
      locale: string;
      timezone: string;
      firstDayOfWeek: number;
      model: string;
      osVersion: string;
      osBuildId: string;
      uniqueId: string | null;
      acquisitionSource: string | null;
      acquisitionMetaJson?: AcquisitionMetaJson | null;
      planData: CreatePlanDto;
      creationProof?: { ts: number; signature: string };
    },
    @Req() req: Request,
  ) {
    const regionCode = this.geoAccessService.getCountryFromRequest(req);
    const ip = this.geoAccessService.getClientIp(req);
    const ua = req.clientUa ?? null;
    return await this.usersService.createUserByUUID(
      data.uuid,
      data.lang,
      data.theme,
      data.aiModel,
      data.platform,
      regionCode ?? data.regionCode,
      data.devicePubKey,
      data.deviceId ?? null,
      data.appVersion,
      Number(data.appBuild),
      data.locale,
      data.timezone,
      data.firstDayOfWeek,
      data.model,
      data.osVersion,
      data.osBuildId,
      data.uniqueId,
      data.acquisitionSource,
      data.acquisitionMetaJson,
      data.planData,
      ua,
      ip,
      data.creationProof,
    );
  }

  @Post('sync-by-purchase-token')
  @UseGuards(BlockedCountriesGuard)
  async syncUser(
    @Body()
    data: SyncUserDto,
    @Req() req: Request,
  ) {
    const ip = this.geoAccessService.getClientIp(req);
    const ua = req.clientUa ?? null;
    return await this.usersService.syncUser(
      data.purchaseToken,
      data.devicePubKey,
      data.deviceId ?? null,
      data.appVersion,
      Number(data.appBuild),
      data.platform,
      data.model,
      data.osVersion,
      data.osBuildId,
      data.uniqueId,
      ua,
      ip,
    );
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post('get-one-by')
  async getOneBy(
    @Body() body: { userId: number | null; email?: string; uuid?: string },
  ) {
    const user = await this.usersService.getOneBy(
      body.userId,
      body.email,
      body.uuid,
    );
    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }
    return user;
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('admin-overview')
  getAdminUserOverview() {
    return this.usersService.getAdminUserOverview();
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('admin-growth')
  getAdminUserGrowth(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity = 'day',
  ) {
    return this.usersService.getAdminUserGrowth(from, to, granularity);
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('admin-new-users')
  getAdminNewUsers(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.getAdminNewUsers(from, to, page, limit);
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('admin-new-users/days')
  getAdminNewUsersDays(@Query('from') from: string, @Query('to') to: string) {
    return this.usersService.getAdminNewUsersDays(from, to);
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('admin-details/:id')
  async getAdminUserDetails(@Param('id') id: string) {
    const user = await this.usersService.getAdminUserDetails(id);
    if (!user) throw new NotFoundException('Користувача не знайдено.');
    return user;
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('get-all')
  getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: SortBy,
    @Query('hasPlan', new ParseHasPlanPipe()) hasPlan?: HasPlan,
  ) {
    return this.usersService.getUsersWithStats({
      page: Number(page ?? 1),
      limit: Number(limit ?? 50),
      sortBy,
      hasPlan,
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
    @Body() updateUserDto: UpdateUserDto,
  ) {
    // Explicit projection also protects this boundary from future DTO growth.
    // Never forward the entire user entity supplied by an HTTP client.
    const {
      hash,
      name,
      lastActiveAt,
      usesWithoutSubscription,
      appVersion,
      appBuild,
    } = updateUserDto;
    return await this.usersService.update(user.uuid, {
      hash,
      ...(name !== undefined ? { name } : {}),
      ...(lastActiveAt !== undefined
        ? { lastActiveAt: new Date(lastActiveAt) }
        : {}),
      ...(usesWithoutSubscription !== undefined
        ? { usesWithoutSubscription }
        : {}),
      ...(appVersion !== undefined ? { appVersion } : {}),
      ...(appBuild !== undefined ? { appBuild } : {}),
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('update-settings')
  async updateUserSettings(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() updateUserSettingsDto: Partial<UserSettings> & { initializeThemeSelection?: boolean },
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
  @UseGuards(AuthGuard('admin-jwt'))
  async deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    // admin-jwt supplies the current database role, not a client profile role.
    const admin = req.user as { role?: AdminRole } | undefined;
    if (admin?.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super administrator access required');
    }
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('User ID must be a positive safe integer');
    }
    // Mail-code verification and inactivity/guest cleanup call the service
    // directly; this authorization applies only to administrative HTTP deletion.
    return await this.usersService.deleteUser(id);
  }
}

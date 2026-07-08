import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { SubscriptionMigrationOptionsDto } from './dto/preview-subscription-migration.dto';
import { EnsureInitialSubscriptionStateDto } from './dto/ensure-initial-subscription-state.dto';
import { SubscribeGooglePlayDto } from './dto/subscribe-google-play.dto';
import { SubscriptionsBootstrapDto } from './dto/subscriptions-bootstrap.dto';
import { SubscriptionsLegacyDryRunService } from './migration/subscriptions-legacy-dry-run.service';
import { SubscriptionsMigrationService } from './migration/subscriptions-migration.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly legacyDryRunService: SubscriptionsLegacyDryRunService,
    private readonly migrationService: SubscriptionsMigrationService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getCurrentUserSubscription(@ActiveUserData() user: ActiveUserDataT) {
    return this.subscriptionsService.getCurrentUserSubscription(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('bootstrap')
  async bootstrap(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: SubscriptionsBootstrapDto = {},
    @Req() req?: Request,
  ) {
    this.debug('subscriptions.bootstrap controller received', {
      ...this.getRequestMeta(req),
      userId: user?.id ?? null,
      userUuid: user?.uuid ?? null,
      appVersion: dto?.appVersion ?? null,
      appBuild: dto?.appBuild ?? null,
      platform: dto?.platform ?? null,
    });

    return this.subscriptionsService.bootstrap(user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('ensure-initial-state')
  async ensureInitialState(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: EnsureInitialSubscriptionStateDto = {},
  ) {
    return this.subscriptionsService.ensureInitialState(user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('trial/start')
  async startTrial(@ActiveUserData() user: ActiveUserDataT) {
    return this.subscriptionsService.startTrial(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('use-without-subscription')
  async useWithoutSubscription(@ActiveUserData() user: ActiveUserDataT) {
    return this.subscriptionsService.useWithoutSubscription(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('google-play/subscribe')
  async subscribeGooglePlay(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: SubscribeGooglePlayDto,
    @Req() req?: Request,
  ) {
    const payload = dto as SubscribeGooglePlayDto & {
      productId?: string | null;
      orderId?: string | null;
    };

    this.debug('subscriptions.google-play controller received', {
      ...this.getRequestMeta(req),
      userId: user?.id ?? null,
      userUuid: user?.uuid ?? null,
      packageName: dto?.packageName ?? null,
      purchaseTokenSuffix: this.tokenSuffix(dto?.purchaseToken),
      productId: payload?.productId ?? null,
      orderId: payload?.orderId ?? null,
      obfuscatedAccountId: dto?.obfuscatedAccountId ?? null,
    });

    return this.subscriptionsService.subscribeGooglePlay(user.id, dto);
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('migration/preview')
  async previewUsersMigration(@Query('chunkSize') chunkSize?: string) {
    return this.legacyDryRunService.previewAllUsers(
      this.normalizeChunkSize(chunkSize),
    );
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post('migration/run')
  async runUsersMigration(@Body() dto: SubscriptionMigrationOptionsDto = {}) {
    return this.migrationService.migrateAllUsers(
      this.normalizeChunkSize(dto.chunkSize),
    );
  }

  private normalizeChunkSize(value: unknown): number {
    if (value === undefined || value === null || value === '') {
      return 100;
    }

    const chunkSize =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);

    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new BadRequestException('chunkSize must be a positive integer');
    }

    if (chunkSize > 500) {
      throw new BadRequestException('chunkSize must be 500 or fewer');
    }

    return chunkSize;
  }

  private getRequestMeta(req?: Request) {
    const typedReq = req as (Request & { clientUa?: string }) | undefined;

    return {
      ip:
        (typedReq?.headers['x-forwarded-for'] as string | undefined) ??
        typedReq?.ip ??
        null,
      userAgent:
        (typedReq?.headers['user-agent'] as string | undefined) ??
        typedReq?.clientUa ??
        null,
      clientUa:
        (typedReq?.headers['x-client-ua'] as string | undefined) ?? null,
      appVersion:
        (typedReq?.headers['x-app-version'] as string | undefined) ?? null,
      appBuild:
        (typedReq?.headers['x-app-build'] as string | undefined) ?? null,
      appPlatform:
        (typedReq?.headers['x-app-platform'] as string | undefined) ?? null,
      deviceId:
        (typedReq?.headers['x-device-id'] as string | undefined) ?? null,
      requestId:
        (typedReq?.headers['x-request-id'] as string | undefined) ?? null,
      logOrigin:
        (typedReq?.headers['x-log-origin'] as string | undefined) ?? null,
    };
  }

  private tokenSuffix(token?: string | null) {
    return token ? token.slice(-10) : null;
  }

  private debug(_message: string, _data: Record<string, unknown>) {
    return;
  }
}

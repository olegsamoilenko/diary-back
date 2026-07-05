import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  ) {
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
  ) {
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
}

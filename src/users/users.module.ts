import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSettingsService } from './user-settings.service';
import { UsersController } from './users.controller';
import { UserSettingsController } from './user-settings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UniqueId } from './entities/unique-id.entity';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { TokensModule } from 'src/tokens/tokens.module';
import { PlansModule } from 'src/plans/plans.module';
import { SaltModule } from 'src/salt/salt.module';
import { EmailsModule } from 'src/emails/emails.module';
import { UserSettings } from './entities/user-settings.entity';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([UserSettings]),
    TypeOrmModule.forFeature([UniqueId]),
    forwardRef(() => AuthModule),
    PaymentsModule,
    TokensModule,
    forwardRef(() => PlansModule),
    SaltModule,
    EmailsModule,
    NotificationsModule,
  ],
  providers: [UsersService, CodeCoreService, UserSettingsService],
  controllers: [UsersController, UserSettingsController],
  exports: [UsersService],
})
export class UsersModule {}

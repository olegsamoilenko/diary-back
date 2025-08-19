import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { TokensModule } from 'src/tokens/tokens.module';
import { PlansModule } from 'src/plans/plans.module';
import { DiaryModule } from 'src/diary/diary.module';
import { SaltModule } from 'src/salt/salt.module';
import { EmailsModule } from 'src/emails/emails.module';
import { UserSettings } from './entities/user-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([UserSettings]),
    forwardRef(() => AuthModule),
    PaymentsModule,
    TokensModule,
    forwardRef(() => PlansModule),
    forwardRef(() => DiaryModule),
    SaltModule,
    EmailsModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}

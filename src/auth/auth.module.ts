import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailsModule } from '../emails/emails.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SmsModule } from 'src/sms/sms.module';
import { SaltModule } from 'src/salt/salt.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminsModule } from '../admins/admins.module';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { PlansModule } from 'src/plans/plans.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'defaultSecret',
        signOptions: { expiresIn: process.env.JWT_ACCESS_TOKEN_TTL || '1h' },
      }),
    }),
    ScheduleModule.forRoot(),
    forwardRef(() => UsersModule),
    EmailsModule,
    SmsModule,
    SaltModule,
    AdminsModule,
    PlansModule,
  ],
  providers: [AuthService, JwtStrategy, AdminAuthService, CodeCoreService],
  controllers: [AuthController, AdminAuthController],
  exports: [AuthService, AdminAuthService],
})
export class AuthModule {}

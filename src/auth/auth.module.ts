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
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

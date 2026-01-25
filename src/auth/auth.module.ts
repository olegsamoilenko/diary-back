import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailsModule } from '../emails/emails.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategies';
import { SmsModule } from 'src/sms/sms.module';
import { SaltModule } from 'src/salt/salt.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminsModule } from '../admins/admins.module';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { PlansModule } from 'src/plans/plans.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from './entities/user-session.entity';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          throw new Error('JWT_SECRET is not set');
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: process.env.JWT_ACCESS_TOKEN_TTL || '1h',
          },
        };
      },
    }),
    TypeOrmModule.forFeature([UserSession]),
    ScheduleModule.forRoot(),
    forwardRef(() => UsersModule),
    EmailsModule,
    SmsModule,
    SaltModule,
    AdminsModule,
    PlansModule,
    AiModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    AdminJwtStrategy,
    AdminAuthService,
    CodeCoreService,
    SessionsService,
  ],
  controllers: [AuthController, AdminAuthController, SessionsController],
  exports: [AuthService, AdminAuthService, SessionsService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TestModule } from './test/test.module';
import { DiaryModule } from 'src/diary/diary.module';
import { AiModule } from 'src/ai/ai.module';
import { SeedsModule } from 'src/seeds/seeds.module';
import { PlansModule } from 'src/plans/plans.module';
import { TokensModule } from 'src/tokens/tokens.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { FilesModule } from 'src/files/files.module';
import { SmsModule } from 'src/sms/sms.module';
import { SaltModule } from 'src/salt/salt.module';
import { KmsModule } from 'src/kms/kms.module';
import { AdminsModule } from 'src/admins/admins.module';
import { RedisModule } from 'src/redis/redis.module';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { InactivityCleanupModule } from 'src/inactivity-cleanup/inactivity-cleanup.module';
import { IapModule } from 'src/iap/iap.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      ssl: process.env.NODE_ENV !== 'development',
      extra:
        process.env.NODE_ENV === 'development'
          ? {}
          : {
              ssl: {
                rejectUnauthorized: false,
              },
            },
      autoLoadEntities: true,
      synchronize: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: seconds(60), limit: 60 }],
    }),
    AuthModule,
    UsersModule,
    DiaryModule,
    AiModule,
    SeedsModule,
    PlansModule,
    TokensModule,
    PaymentsModule,
    FilesModule,
    TestModule,
    SmsModule,
    SaltModule,
    KmsModule,
    AdminsModule,
    RedisModule,
    InactivityCleanupModule,
    IapModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

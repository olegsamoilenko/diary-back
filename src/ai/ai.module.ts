import { forwardRef, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiComment } from './entities/aiComments.entity';
import { DiaryModule } from 'src/diary/diary.module';
import { AiController } from './ai.controller';
import { UsersModule } from 'src/users/users.module';
import { AIAnswer } from './entities/dialog.entity';
import { PlansModule } from 'src/plans/plans.module';
import { AiGateway } from './gateway/ai.gateway';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiComment]),
    TypeOrmModule.forFeature([AIAnswer]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'defaultSecret',
        signOptions: { expiresIn: process.env.JWT_ACCESS_TOKEN_TTL || '1h' },
      }),
    }),
    forwardRef(() => DiaryModule),
    forwardRef(() => UsersModule),
    PlansModule,
  ],
  providers: [AiService, AiGateway],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}

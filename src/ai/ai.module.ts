import { forwardRef, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiComment } from './entities/ai-comment.entity';
import { DiaryModule } from 'src/diary/diary.module';
import { AiController } from './ai.controller';
import { UsersModule } from 'src/users/users.module';
import { PlansModule } from 'src/plans/plans.module';
import { AiGateway } from './gateway/ai.gateway';
import { JwtModule } from '@nestjs/jwt';
import { KmsModule } from 'src/kms/kms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiComment]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'defaultSecret',
        signOptions: { expiresIn: process.env.JWT_ACCESS_TOKEN_TTL || '1h' },
      }),
    }),
    forwardRef(() => DiaryModule),
    forwardRef(() => UsersModule),
    PlansModule,
    KmsModule,
  ],
  providers: [AiService, AiGateway],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}

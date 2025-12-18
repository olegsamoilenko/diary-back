import { forwardRef, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { UsersModule } from 'src/users/users.module';
import { PlansModule } from 'src/plans/plans.module';
import { AiGateway } from './gateway/ai.gateway';
import { JwtModule } from '@nestjs/jwt';
import { KmsModule } from 'src/kms/kms.module';
import { TokensModule } from 'src/tokens/tokens.module';
import { PlanGateway } from './gateway/plan.gateway';
import { AiModelAnswerReview } from './entities/ai-model-answer-review.entity';
import { PositiveNegativeAiModelAnswer } from './entities/positive-negative-ai-model-answer.entity';
import { RegenerateAiModelAnswer } from './entities/regenerate-ai-model-answer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiModelAnswerReview]),
    TypeOrmModule.forFeature([PositiveNegativeAiModelAnswer]),
    TypeOrmModule.forFeature([RegenerateAiModelAnswer]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'defaultSecret',
        signOptions: { expiresIn: process.env.JWT_ACCESS_TOKEN_TTL || '1h' },
      }),
    }),
    forwardRef(() => UsersModule),
    PlansModule,
    KmsModule,
    TokensModule,
  ],
  providers: [AiService, AiGateway, PlanGateway],
  controllers: [AiController],
  exports: [AiService, PlanGateway],
})
export class AiModule {}

import { forwardRef, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiPreferencesService } from './ai-preferences.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiPreferencesController } from './ai-preferences.controller';
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
import { UserAiPreferences } from './entities/user-ai-preferences.entity';
import { ModelReviewService } from './model-review.service';
import { ModelReviewController } from './model-review.controller';
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module';
import { AiResponseMonitoringModule } from 'src/ai-response-monitoring/ai-response-monitoring.module';
import { EmbeddingBatchService } from './embeddings/embedding-batch.service';
import { OpenAiEmbeddingProvider } from './embeddings/openai-embedding.provider';
import { MemoryTagCatalogV2Entity } from './entities/memory-tag-catalog-v2.entity';
import { MemoryTagCatalogV2Service } from './memory-tag-catalog-v2.service';
import { PushNotificationsModule } from 'src/push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiModelAnswerReview]),
    TypeOrmModule.forFeature([PositiveNegativeAiModelAnswer]),
    TypeOrmModule.forFeature([RegenerateAiModelAnswer]),
    TypeOrmModule.forFeature([UserAiPreferences]),
    TypeOrmModule.forFeature([MemoryTagCatalogV2Entity]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'defaultSecret',
        signOptions: { expiresIn: process.env.JWT_ACCESS_TOKEN_TTL || '1h' },
      }),
    }),
    forwardRef(() => UsersModule),
    PlansModule,
    SubscriptionsModule,
    KmsModule,
    TokensModule,
    AiResponseMonitoringModule,
    PushNotificationsModule,
  ],
  providers: [
    AiService,
    AiGateway,
    PlanGateway,
    AiPreferencesService,
    ModelReviewService,
    EmbeddingBatchService,
    OpenAiEmbeddingProvider,
    MemoryTagCatalogV2Service,
  ],
  controllers: [AiController, AiPreferencesController, ModelReviewController],
  exports: [AiService, PlanGateway, AiPreferencesService],
})
export class AiModule {}

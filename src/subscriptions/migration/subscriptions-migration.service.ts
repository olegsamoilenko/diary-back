import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Plan } from 'src/plans/entities/plan.entity';
import { User } from 'src/users/entities/user.entity';
import { StoreSubscription } from '../entities/store-subscription.entity';
import { UserPlanState } from '../entities/user-plan-state.entity';
import {
  LegacyStoreSubscriptionDraft,
  LegacyUserPlanStateDraft,
  SubscriptionLegacyMapper,
} from '../subscription-legacy.mapper';
import { SubscriptionsLegacyDryRunService } from './subscriptions-legacy-dry-run.service';

export type SubscriptionMigrationRunResult = {
  totalUsers: number;
  chunkSize: number;
  userPlanStatesUpserted: number;
  storeSubscriptionsUpserted: number;
  warnings: Array<{ userId: number; warnings: string[] }>;
};

@Injectable()
export class SubscriptionsMigrationService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    @InjectRepository(StoreSubscription)
    private readonly storeSubscriptionsRepository: Repository<StoreSubscription>,
    @InjectRepository(UserPlanState)
    private readonly userPlanStatesRepository: Repository<UserPlanState>,
    private readonly mapper: SubscriptionLegacyMapper,
    private readonly dryRunService: SubscriptionsLegacyDryRunService,
  ) {}

  async migrateAllUsers(
    chunkSize = 100,
    now = new Date(),
  ): Promise<SubscriptionMigrationRunResult> {
    const normalizedChunkSize = this.normalizeChunkSize(chunkSize);
    const result: SubscriptionMigrationRunResult = {
      totalUsers: 0,
      chunkSize: normalizedChunkSize,
      userPlanStatesUpserted: 0,
      storeSubscriptionsUpserted: 0,
      warnings: [],
    };
    let lastUserId = 0;

    while (true) {
      const users = await this.usersRepository.find({
        select: { id: true },
        where: { id: MoreThan(lastUserId) },
        order: { id: 'ASC' },
        take: normalizedChunkSize,
      });

      if (!users.length) {
        break;
      }

      for (const user of users) {
        const userResult = await this.migrateUser(user.id, now);
        result.totalUsers += 1;
        result.userPlanStatesUpserted += 1;
        result.storeSubscriptionsUpserted +=
          userResult.storeSubscriptionsUpserted;

        if (userResult.warnings.length) {
          result.warnings.push({
            userId: user.id,
            warnings: userResult.warnings,
          });
        }
      }

      lastUserId = users[users.length - 1].id;
    }

    return result;
  }

  private async migrateUser(userId: number, now: Date) {
    const plans = await this.plansRepository.find({
      where: { user: { id: userId } },
      order: { id: 'ASC' },
    });
    const preview = await this.dryRunService.buildPreviewFromPlans(
      userId,
      plans,
      now,
    );
    const storeSubscriptionsByLegacyPlanId = new Map<number, StoreSubscription>();
    let storeSubscriptionsUpserted = 0;

    for (const draft of preview.storeSubscriptions) {
      const saved = await this.upsertStoreSubscription(draft);
      storeSubscriptionsUpserted += 1;

      if (draft.legacyPlanId) {
        storeSubscriptionsByLegacyPlanId.set(draft.legacyPlanId, saved);
      }
    }

    const currentStoreSubscriptionId = preview.selectedLegacyPlanId
      ? storeSubscriptionsByLegacyPlanId.get(preview.selectedLegacyPlanId)?.id ??
        null
      : null;

    await this.upsertUserPlanState({
      ...preview.userPlanState,
      currentStoreSubscriptionId,
    });

    return {
      storeSubscriptionsUpserted,
      warnings: preview.warnings,
    };
  }

  private async upsertStoreSubscription(
    draft: LegacyStoreSubscriptionDraft,
  ): Promise<StoreSubscription> {
    const existing = await this.storeSubscriptionsRepository.findOne({
      where: { purchaseToken: draft.purchaseToken },
    });
    const entity = existing
      ? this.storeSubscriptionsRepository.merge(existing, draft)
      : this.storeSubscriptionsRepository.create(draft);

    return this.storeSubscriptionsRepository.save(entity);
  }

  private async upsertUserPlanState(
    draft: LegacyUserPlanStateDraft,
  ): Promise<UserPlanState> {
    const existing = await this.userPlanStatesRepository.findOne({
      where: { userId: draft.userId },
    });
    const entity = existing
      ? this.userPlanStatesRepository.merge(existing, draft)
      : this.userPlanStatesRepository.create(draft);

    return this.userPlanStatesRepository.save(entity);
  }

  private normalizeChunkSize(chunkSize: number): number {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      return 100;
    }

    return Math.min(chunkSize, 500);
  }
}

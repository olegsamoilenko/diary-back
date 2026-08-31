import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ForumCommentsService } from '../forum/services/forum-comments.service';
import { CommunityGateway } from '../forum/gateway/community.gateway';
import { ForumTopic } from '../forum/entities/forum-topic.entity';
import { ForumTopicWatcher } from '../forum/entities/forum-topic-watcher.entity';
import { ForumPublicProfile } from '../forum/entities/forum-public-profile.entity';
import { ForumContentStatus } from '../forum/types/forum-content-status.enum';
import { ForumTopicVisibility } from '../forum/types/forum-topic-visibility.enum';
import { UserPushToken } from '../push-notifications/entities/user-push-token.entity';
import { User } from '../users/entities/user.entity';

type SeedArgs = {
  recipientUserId: number | null;
  topicId: string | null;
  authorUserId: number | null;
  content: string | null;
  dryRun: boolean;
};

type SeedTarget = {
  recipientUserId: number;
  topic: ForumTopic;
  pushRecipientUserIds: number[];
};

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : null;
}

function getOptionalPositiveIntArg(name: string): number | null {
  const raw = getArg(name);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(): SeedArgs {
  return {
    recipientUserId: getOptionalPositiveIntArg('recipient-user-id'),
    topicId: getArg('topic-id'),
    authorUserId: getOptionalPositiveIntArg('author-user-id'),
    content: getArg('content'),
    dryRun: process.argv.includes('--dry-run'),
  };
}

async function getPushRecipientUserIds(
  dataSource: DataSource,
  topicId: string,
): Promise<number[]> {
  const rows = await dataSource
    .getRepository(ForumTopicWatcher)
    .createQueryBuilder('watcher')
    .innerJoin(
      UserPushToken,
      'pushToken',
      'pushToken.userId = watcher.userId AND pushToken.isActive = true',
    )
    .select('DISTINCT watcher.userId', 'userId')
    .where('watcher.topicId = :topicId', { topicId })
    .andWhere('watcher.isMuted = false')
    .getRawMany<{ userId: string | number }>();

  return rows.map((row) => Number(row.userId));
}

async function getEligibleTopicsForRecipient(
  dataSource: DataSource,
  recipientUserId: number,
  topicId?: string | null,
): Promise<ForumTopic[]> {
  const query = dataSource
    .getRepository(ForumTopic)
    .createQueryBuilder('topic')
    .innerJoin(
      ForumTopicWatcher,
      'watcher',
      'watcher.topicId = topic.id AND watcher.userId = :recipientUserId',
      { recipientUserId },
    )
    .where('watcher.isMuted = false')
    .andWhere('topic.status = :status', {
      status: ForumContentStatus.PUBLISHED,
    })
    .andWhere('topic.visibility = :visibility', {
      visibility: ForumTopicVisibility.PUBLIC,
    })
    .andWhere('topic.isLocked = false')
    .andWhere('topic.isModerationRemoved = false')
    .andWhere('topic.deletedAt IS NULL')
    .orderBy('topic.lastActivityAt', 'DESC')
    .take(30);

  if (topicId) {
    query.andWhere('topic.id = :topicId', { topicId });
  }

  return query.getMany();
}

async function resolveTarget(
  dataSource: DataSource,
  args: SeedArgs,
): Promise<SeedTarget> {
  const pushTokenRepo = dataSource.getRepository(UserPushToken);

  const activeTokens = await pushTokenRepo.find({
    where: {
      isActive: true,
      ...(args.recipientUserId ? { userId: args.recipientUserId } : {}),
    },
    order: { updatedAt: 'DESC' },
    take: args.recipientUserId ? 100 : 200,
  });

  const candidateRecipientIds = [
    ...new Set(activeTokens.map((token) => token.userId)),
  ];

  if (!candidateRecipientIds.length) {
    throw new Error('No active push token recipient found');
  }

  let fallback: SeedTarget | null = null;

  for (const recipientUserId of candidateRecipientIds) {
    const topics = await getEligibleTopicsForRecipient(
      dataSource,
      recipientUserId,
      args.topicId,
    );

    for (const topic of topics) {
      const pushRecipientUserIds = await getPushRecipientUserIds(
        dataSource,
        topic.id,
      );

      if (!pushRecipientUserIds.includes(recipientUserId)) continue;

      const target = { recipientUserId, topic, pushRecipientUserIds };

      if (pushRecipientUserIds.length === 1) return target;
      fallback ??= target;
    }
  }

  if (fallback) return fallback;

  throw new Error(
    args.topicId
      ? `Topic ${args.topicId} is not an eligible watched topic for an active push recipient`
      : 'No eligible watched forum topic found for an active push recipient',
  );
}

async function resolveAuthor(
  dataSource: DataSource,
  recipientUserId: number,
  authorUserId: number | null,
): Promise<{ userId: number; username: string }> {
  const profileRepo = dataSource.getRepository(ForumPublicProfile);

  if (authorUserId) {
    const profile = await profileRepo.findOne({
      where: {
        userId: authorUserId,
        isForumEnabled: true,
        isBanned: false,
      },
    });

    if (!profile) {
      throw new Error(
        `Author user ${authorUserId} has no enabled forum profile`,
      );
    }

    if (profile.userId === recipientUserId) {
      throw new Error('Author and push recipient must be different users');
    }

    return {
      userId: profile.userId,
      username: profile.username ?? profile.displayName,
    };
  }

  const profile = await profileRepo
    .createQueryBuilder('profile')
    .innerJoin(User, 'user', 'user.id = profile.userId')
    .where('profile.userId != :recipientUserId', { recipientUserId })
    .andWhere('profile.isForumEnabled = true')
    .andWhere('profile.isBanned = false')
    .orderBy('user.isSystem', 'DESC')
    .addOrderBy('profile.createdAt', 'ASC')
    .getOne();

  if (!profile) {
    throw new Error('No eligible forum comment author found');
  }

  return {
    userId: profile.userId,
    username: profile.username ?? profile.displayName,
  };
}

async function bootstrap() {
  const args = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const commentsService = app.get(ForumCommentsService);
    const communityGateway = app.get(CommunityGateway);

    if (!communityGateway.server) {
      communityGateway.server = {
        to: () => ({ emit: () => undefined }),
      } as unknown as CommunityGateway['server'];
    }

    const target = await resolveTarget(dataSource, args);
    const author = await resolveAuthor(
      dataSource,
      target.recipientUserId,
      args.authorUserId,
    );
    const recipientTokenCount = await dataSource
      .getRepository(UserPushToken)
      .count({
        where: {
          userId: target.recipientUserId,
          isActive: true,
        },
      });

    console.log('[seed][forum-comment-push] selected target', {
      topicId: target.topic.id,
      topicTitle: target.topic.title,
      authorUserId: author.userId,
      authorUsername: author.username,
      expectedPushRecipientUserIds: target.pushRecipientUserIds,
      selectedRecipientUserId: target.recipientUserId,
      selectedRecipientActiveTokenCount: recipientTokenCount,
      dryRun: args.dryRun,
    });

    if (args.dryRun) return;

    const content =
      args.content ||
      `[Push seed ${new Date().toISOString()}] Тестовий коментар для перевірки переходу з push-сповіщення.`;

    const comment = await commentsService.createComment(
      author.userId,
      target.topic.id,
      { content },
    );

    const savedComment = await dataSource.getRepository(ForumTopic).findOne({
      where: { id: target.topic.id },
      select: { id: true, lastCommentId: true },
    });

    console.log('[seed][forum-comment-push] comment created through service', {
      topicId: target.topic.id,
      commentId: comment.id,
      topicLastCommentId: savedComment?.lastCommentId ?? null,
      pushPathExecuted: true,
    });
  } finally {
    await Promise.race([
      app.close(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 3_000);
      }),
    ]);
  }
}

void bootstrap()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[seed][forum-comment-push] failed', error);
    process.exit(1);
  });

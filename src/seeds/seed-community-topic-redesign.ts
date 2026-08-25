import AppDataSource from '../../data-source';
import { DataSource } from 'typeorm';
import { ForumCategory } from 'src/forum/entities/forum-category.entity';
import { ForumComment } from 'src/forum/entities/forum-comment.entity';
import { ForumPublicProfile } from 'src/forum/entities/forum-public-profile.entity';
import { ForumTopic } from 'src/forum/entities/forum-topic.entity';
import { ForumCategorySlug } from 'src/forum/types/forum-category-slug.enum';
import { ForumContentStatus } from 'src/forum/types/forum-content-status.enum';
import { ForumTopicType } from 'src/forum/types/forum-topic-type.enum';
import { ForumTopicVisibility } from 'src/forum/types/forum-topic-visibility.enum';

const LEGACY_SEED_TITLE = '[UI seed] Як м’яко повернутися до корисної звички?';
const SEED_TITLE = 'Як м’яко повернутися до корисної звички?';

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

async function bootstrap() {
  const dataSource = await new DataSource({
    ...AppDataSource.options,
    // The shared dev glob also matches `*.entity.spec.ts`; seeds must load
    // entity metadata only, otherwise Jest globals are imported at runtime.
    entities: ['src/**/*.entity.ts', 'src/**/entities/!(*.spec).ts'],
    migrations: [],
  }).initialize();

  try {
    const topicId = await dataSource.transaction(async (manager) => {
      const profileRepo = manager.getRepository(ForumPublicProfile);
      const categoryRepo = manager.getRepository(ForumCategory);
      const topicRepo = manager.getRepository(ForumTopic);
      const commentRepo = manager.getRepository(ForumComment);

      const profiles = await profileRepo.find({
        where: { isForumEnabled: true, isBanned: false },
        order: { createdAt: 'ASC' },
        take: 3,
      });

      if (profiles.length === 0) {
        throw new Error(
          'No enabled forum profile found. Create a public profile or run seed:forum-system-users first.',
        );
      }

      const authorIds = [0, 1, 2].map(
        (index) => profiles[index % profiles.length].userId,
      );
      const category =
        (await categoryRepo.findOne({
          where: { slug: ForumCategorySlug.HABITS },
        })) ??
        (await categoryRepo.findOne({
          where: { isActive: true },
          order: { sortOrder: 'ASC' },
        }));

      if (!category) {
        throw new Error(
          'No forum category found. Run npm run seed:forum-categories first.',
        );
      }

      let topic = await topicRepo.findOne({
        where: [
          { title: SEED_TITLE, isSystem: true },
          { title: LEGACY_SEED_TITLE, isSystem: true },
        ],
        withDeleted: true,
      });

      if (!topic) {
        topic = topicRepo.create();
      }

      Object.assign(topic, {
        authorId: authorIds[0],
        categoryId: category.id,
        type: ForumTopicType.DISCUSSION,
        title: SEED_TITLE,
        content:
          'Після кількох насичених тижнів я випав із вечірніх прогулянок. Хочу повернути звичку без жорсткого плану й почуття провини. Що допомагало вам почати знову?',
        status: ForumContentStatus.PUBLISHED,
        visibility: ForumTopicVisibility.PUBLIC,
        commentsCount: 0,
        reactionsCount: 0,
        likesCount: 4,
        reportsCount: 0,
        viewsCount: 28,
        watchersCount: 2,
        lang: 'uk',
        lastActivityAt: minutesAgo(8),
        lastCommentAuthorId: null,
        lastCommentId: null,
        createdByAdminId: null,
        isSystem: true,
        isPinned: false,
        isLocked: false,
        isFeatured: false,
        isEdited: false,
        isModerationRemoved: false,
        moderationRemovedAt: null,
        moderationRemovedByAdminId: null,
        moderationRemoveReason: null,
        moderationRemoveNote: null,
        editedAt: null,
        deletedAt: null,
        createdAt: topic.createdAt ?? minutesAgo(180),
      });

      topic = await topicRepo.save(topic);

      await commentRepo.delete({ topicId: topic.id });

      const rootOne = await commentRepo.save(
        commentRepo.create({
          topicId: topic.id,
          authorId: authorIds[1],
          parentCommentId: null,
          replyToCommentId: null,
          content:
            'Мені допомагає домовитися із собою лише про десять хвилин. Якщо після них не хочеться продовжувати — повертаюся додому без докорів.',
          status: ForumContentStatus.PUBLISHED,
          likesCount: 3,
          createdAt: minutesAgo(120),
        }),
      );

      const rootTwo = await commentRepo.save(
        commentRepo.create({
          topicId: topic.id,
          authorId: authorIds[2],
          parentCommentId: null,
          replyToCommentId: null,
          content:
            'Я прив’язав прогулянку до вже стабільної дії — одразу після вечері. Так не треба щоразу шукати окремий час.',
          status: ForumContentStatus.PUBLISHED,
          likesCount: 2,
          createdAt: minutesAgo(95),
        }),
      );

      const directReplyOne = await commentRepo.save(
        commentRepo.create({
          topicId: topic.id,
          authorId: authorIds[0],
          parentCommentId: rootOne.id,
          replyToCommentId: null,
          content:
            'Десять хвилин звучить реалістично. Так поріг входу справді стає нижчим.',
          status: ForumContentStatus.PUBLISHED,
          likesCount: 1,
          createdAt: minutesAgo(70),
        }),
      );

      const directReplyTwo = await commentRepo.save(
        commentRepo.create({
          topicId: topic.id,
          authorId: authorIds[1],
          parentCommentId: rootTwo.id,
          replyToCommentId: null,
          content:
            'Підтримую. У мене так само працює зв’язка «закрив ноутбук — вийшов надвір».',
          status: ForumContentStatus.PUBLISHED,
          likesCount: 1,
          createdAt: minutesAgo(50),
        }),
      );

      const nestedReplyOne = await commentRepo.save(
        commentRepo.create({
          topicId: topic.id,
          authorId: authorIds[2],
          parentCommentId: rootOne.id,
          replyToCommentId: directReplyOne.id,
          content:
            'І ще можна підготувати взуття біля дверей — дрібниця, але прибирає одну зайву перешкоду.',
          status: ForumContentStatus.PUBLISHED,
          likesCount: 0,
          createdAt: minutesAgo(25),
        }),
      );

      const nestedReplyTwo = await commentRepo.save(
        commentRepo.create({
          topicId: topic.id,
          authorId: authorIds[0],
          parentCommentId: rootTwo.id,
          replyToCommentId: directReplyTwo.id,
          content:
            'Гарна формула. Спробую зробити завершення роботи тригером для короткої прогулянки.',
          status: ForumContentStatus.PUBLISHED,
          likesCount: 0,
          createdAt: minutesAgo(8),
        }),
      );

      topic.commentsCount = 6;
      topic.lastCommentId = nestedReplyTwo.id;
      topic.lastCommentAuthorId = nestedReplyTwo.authorId;
      topic.lastActivityAt = nestedReplyTwo.createdAt;
      await topicRepo.save(topic);

      // Keep references explicit: this also documents the intended three-level tree.
      void nestedReplyOne;

      return topic.id;
    });

    console.log(`[seed] community redesign topic ready: ${topicId}`);
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error('[seed] community redesign topic failed', error);
  process.exit(1);
});

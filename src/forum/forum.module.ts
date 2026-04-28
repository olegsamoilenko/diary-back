import { Module } from '@nestjs/common';
import { ForumService } from './services/forum.service';
import { ForumController } from './controllers/forum.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumPublicProfile } from './entities/forum-public-profile.entity';
import { ForumCategory } from './entities/forum-category.entity';
import { ForumTopic } from './entities/forum-topic.entity';
import { ForumComment } from './entities/forum-comment.entity';
import { ForumCommentsService } from './services/forum-comments.service';
import { ForumTopicWatchersService } from './services/forum-topic-watchers.service';
import { ForumTopicWatcher } from './entities/forum-topic-watcher.entity';
import { ForumTopicWatchersController } from './controllers/forum-topic-watchers.controller';
import { ForumCommentsController } from './controllers/forum-comments.controller';
import { ForumTopicReadStatesService } from './services/forum-topic-read-states.service';
import { ForumTopicReadStatesController } from './controllers/forum-topic-read-states.controller';
import { ForumNotification } from './entities/forum-notification.entity';
import { ForumTopicReadState } from './entities/forum-topic-read-state.entity';
import { ForumNotificationsService } from './services/forum-notifications.service';
import { ForumNotificationsController } from './controllers/forum-notifications.controller';
import { ForumReaction } from './entities/forum-reaction.entity';
import { ForumReactionsService } from './services/forum-reactions.service';
import { ForumReactionsController } from './controllers/forum-reactions.controller';
import { ForumBookmark } from './entities/forum-bookmark.entity';
import { ForumBookmarksService } from './services/forum-bookmarks.service';
import { ForumBookmarksController } from './controllers/forum-bookmarks.controller';
import { ForumReport } from './entities/forum-report.entity';
import { ForumReportsService } from './services/forum-reports.service';
import { User } from 'src/users/entities/user.entity';
import { ForumModerationLog } from './entities/forum-moderation-log.entity';
import { ForumModerationLogsService } from './services/forum-moderation-logs.service';
import { ForumAiModerationResult } from './entities/forum-ai-moderation-result.entity';
import { ForumAiModerationResultsService } from './services/forum-ai-moderation-results.service';
import { ForumAiModerationResultsController } from './controllers/forum-ai-moderation-results.controller';
import { ForumModerationLogsController } from './controllers/forum-moderation-logs.controller';
import { ForumReportsController } from './controllers/forum-reports.controller';
import { ForumMention } from './entities/forum-mention.entity';
import { ForumMentionsService } from './services/forum-mentions.service';
import { ForumMentionsController } from './controllers/forum-mentions.controller';
import { ForumView } from './entities/forum-view.entity';
import { ForumViewsService } from './services/forum-views.service';
import { ForumViewsController } from './controllers/forum-views.controller';
import { ForumConversation } from './entities/forum-conversation.entity';
import { ForumConversationsService } from './services/forum-conversations.service';
import { ForumConversationsController } from './controllers/forum-conversations.controller';
import { ForumMessage } from './entities/forum-message.entity';
import { ForumMessagesService } from './services/forum-messages.service';
import { ForumMessagesController } from './controllers/forum-messages.controller';
import { ForumUserBlock } from './entities/forum-user-block.entity';
import { ForumUserBlocksController } from './controllers/forum-user-blocks.controller';
import { ForumUserBlocksService } from './services/forum-user-blocks.service';
import { ForumPublicProfilesService } from './services/forum-public-profiles.service';
import { ForumPublicProfilesController } from './controllers/forum-public-profiles.controller';
import { ForumTopicsService } from './services/forum-topics.service';
import { ForumTopicsController } from './controllers/forum-topics.controller';
import { ForumCategoriesService } from './services/forum-categories.service';
import { ForumCategoriesController } from './controllers/forum-categories.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ForumPublicProfile,
      ForumCategory,
      ForumTopic,
      ForumComment,
      ForumTopicWatcher,
      ForumNotification,
      ForumTopicReadState,
      ForumReaction,
      ForumBookmark,
      ForumReport,
      User,
      ForumModerationLog,
      ForumAiModerationResult,
      ForumMention,
      ForumView,
      ForumConversation,
      ForumMessage,
      ForumUserBlock,
    ]),
  ],
  controllers: [
    ForumController,
    ForumTopicWatchersController,
    ForumCommentsController,
    ForumTopicReadStatesController,
    ForumNotificationsController,
    ForumReactionsController,
    ForumBookmarksController,
    ForumAiModerationResultsController,
    ForumModerationLogsController,
    ForumReportsController,
    ForumMentionsController,
    ForumViewsController,
    ForumConversationsController,
    ForumMessagesController,
    ForumUserBlocksController,
    ForumPublicProfilesController,
    ForumTopicsController,
    ForumCategoriesController,
  ],
  providers: [
    ForumService,
    ForumCommentsService,
    ForumTopicWatchersService,
    ForumTopicReadStatesService,
    ForumNotificationsService,
    ForumReactionsService,
    ForumBookmarksService,
    ForumReportsService,
    ForumModerationLogsService,
    ForumAiModerationResultsService,
    ForumMentionsService,
    ForumViewsService,
    ForumConversationsService,
    ForumMessagesService,
    ForumUserBlocksService,
    ForumPublicProfilesService,
    ForumTopicsService,
    ForumCategoriesService,
  ],
  exports: [ForumCommentsService, ForumTopicWatchersService],
})
export class ForumModule {}

import { ForumComment } from '../entities/forum-comment.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

export const assertCommentCanBeRepliedTo = (comment: ForumComment | null) => {
  if (!comment) {
    throwError(
      HttpStatus.NOT_FOUND,
      'Comment not found',
      'Comment not found.',
      'COMMENT_NOT_FOUND',
    );
  }

  if (comment.status === ForumContentStatus.REMOVED_BY_MODERATOR) {
    throwError(
      HttpStatus.BAD_REQUEST,
      'Comment removed by moderator',
      'This comment was removed by a moderator. You can no longer reply to it.',
      'FORUM_COMMENT_REMOVED_BY_MODERATOR_CANNOT_REPLY',
    );
  }

  if (comment.status === ForumContentStatus.REMOVED_BY_AUTHOR) {
    throwError(
      HttpStatus.BAD_REQUEST,
      'Comment removed by author',
      'This comment was deleted by its author. You can no longer reply to it.',
      'FORUM_COMMENT_REMOVED_BY_AUTHOR_CANNOT_REPLY',
    );
  }

  if (comment.status !== ForumContentStatus.PUBLISHED) {
    throwError(
      HttpStatus.BAD_REQUEST,
      'Comment cannot be replied to',
      'You can no longer reply to this comment.',
      'FORUM_COMMENT_CANNOT_REPLY',
    );
  }
};

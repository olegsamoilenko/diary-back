import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ForumComment } from '../entities/forum-comment.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

export const assertCommentCanBeRepliedTo = (comment: ForumComment | null) => {
  if (!comment) {
    throwError(
      HttpStatus.NOT_FOUND,
      'Comment not found',
      'Comment not found',
      'COMMENT_NOT_FOUND',
    );
  }

  if (comment.status === ForumContentStatus.REMOVED_BY_MODERATOR) {
    throw new BadRequestException(
      'This comment was removed by a moderator. You can no longer reply to it.',
    );
  }

  if (comment.status === ForumContentStatus.REMOVED_BY_AUTHOR) {
    throw new BadRequestException(
      'This comment was deleted by its author. You can no longer reply to it.',
    );
  }

  if (comment.status !== ForumContentStatus.PUBLISHED) {
    throw new BadRequestException('You can no longer reply to this comment.');
  }
};

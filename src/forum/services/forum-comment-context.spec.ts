import { describe, it, expect, jest } from '@jest/globals';
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));
import { ForumCommentsService } from './forum-comments.service';

describe('comment jump context', () => {
  it.each([0, 4, 5, 6])(
    'keeps the root when a reply has %i preceding replies',
    async (count) => {
      const root = {
        id: 'root',
        topicId: 'topic',
        parentCommentId: null,
        createdAt: new Date(0),
      };
      const target = {
        ...root,
        id: 'target',
        parentCommentId: root.id,
        createdAt: new Date(10000),
      };
      const replies = Array.from({ length: count }, (_, i) => ({
        ...target,
        id: `reply-${i}`,
        createdAt: new Date(i + 1),
      }));
      const service = Object.assign(
        Object.create(ForumCommentsService.prototype),
        {
          commentsRepo: {
            findOne: jest
              .fn<any>()
              .mockImplementation(async ({ where }) =>
                where.id === target.id ? target : root,
              ),
          },
          mapCommentResponse: (comment: unknown) => comment,
          buildCommentsBaseQb: () => {
            const params: Record<string, any> = {};
            let before = false;
            const qb: any = {
              andWhere: (sql: string, values = {}) => {
                Object.assign(params, values);
                before ||= sql.includes('comment.createdAt <');
                return qb;
              },
              orderBy: () => qb,
              addOrderBy: () => qb,
              take: () => qb,
              getOne: async () => (params.targetId ? target : root),
              getMany: async () =>
                params.parentId && before ? [...replies].reverse() : [],
            };
            return qb;
          },
        },
      );
      const result = await service.getCommentContext({
        commentId: target.id,
        userId: 1,
        rootAroundLimit: 5,
        repliesAroundLimit: 5,
        replyPreviewLimit: 5,
      });
      const ids = result.comments.map((comment: any) => comment.id);
      expect(ids[0]).toBe(root.id);
      expect(ids).toContain(target.id);
      expect(ids.filter((id: string) => id === root.id)).toHaveLength(1);
      expect(result.repliesPaginationByParentId[root.id].hasMoreBefore).toBe(
        count > 5,
      );
    },
  );
});

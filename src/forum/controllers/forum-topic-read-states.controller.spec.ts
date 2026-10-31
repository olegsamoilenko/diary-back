import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, it, expect, jest } from '@jest/globals';
import { ForumTopicReadStatesController } from './forum-topic-read-states.controller';

describe('mark all community topics read', () => {
  it('uses the authenticated account and retains the controller authentication guard', async () => {
    const service = { markAllTopicsAsRead: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }) };
    const controller = new ForumTopicReadStatesController(service as any);
    expect(await controller.markAllTopicsAsRead({ id: 7 } as any)).toEqual({ success: true });
    expect(service.markAllTopicsAsRead).toHaveBeenCalledWith(7);
    expect(Reflect.getMetadata(GUARDS_METADATA, ForumTopicReadStatesController).length).toBeGreaterThan(0);
  });
});

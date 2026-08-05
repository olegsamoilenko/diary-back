import { describe, expect, it } from '@jest/globals';
import { getMetadataArgsStorage } from 'typeorm';
import { ForumContentModerationLog } from './forum-content-moderation-log.entity';

describe('ForumContentModerationLog', () => {
  it('stores fractional risk scores returned by moderation', () => {
    const riskScoreColumn = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === ForumContentModerationLog &&
        column.propertyName === 'riskScore',
    );

    expect(riskScoreColumn?.options.type).toBe('real');
  });
});

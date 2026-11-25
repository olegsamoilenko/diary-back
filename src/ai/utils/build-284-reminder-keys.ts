import { createHash } from 'node:crypto';
import type { MemoryCapsuleScheduledReminderItem } from '../types/memoryCapsuleV2';

/** Build 284 preserves a nemory: key verbatim. Its editor decodes percent
 * escapes a second time, so the source identity must be URL-safe already. */
export function withBuild284ReminderKeys<
  T extends { scheduledReminders: MemoryCapsuleScheduledReminderItem[] },
>(
  result: T,
  build: string | undefined,
  userId: number,
  source: string,
  operationId: string | undefined,
): T {
  if (build !== '284' || !operationId || !result.scheduledReminders.length)
    return result;

  const operation = createHash('sha256')
    .update(JSON.stringify([userId, source, operationId]))
    .digest('hex');

  return {
    ...result,
    scheduledReminders: result.scheduledReminders.map((reminder, index) => ({
      ...reminder,
      reminderKey: `nemory:${operation}-${index}`,
    })),
  };
}

import { DataSource, EntityManager, EntityTarget } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { TokenUsageHistory } from '../tokens/entities/token-usage-history.entity';
import { EntriesStat } from './entities/entries-stat.entity';
import { DialogsStat } from './entities/dialogs-stat.entity';
import { CheckinsStat } from './entities/checkins-stat.entity';
import { CheckinDialogsStat } from './entities/checkin-dialogs-stat.entity';
import { DiaryStatAiInput } from './entities/diary-stat-ai-input';
import type { CreateDiaryStatDto } from './dto/create-diary-stat.dto';

type StatRow = DiaryStatAiInput & {
  id: number;
  user: User;
  createdAt: Date;
  checkinName?: string | null;
};
const sources = {
  entry: { entity: EntriesStat, operation: 'generate_entry_response' },
  dialog: { entity: DialogsStat, operation: 'generate_dialog_response' },
  checkin: { entity: CheckinsStat, operation: 'generate_checkin_response' },
  'checkin-dialog': {
    entity: CheckinDialogsStat,
    operation: 'generate_checkin_dialog_response',
  },
} satisfies Record<
  string,
  { entity: EntityTarget<StatRow>; operation: string }
>;
export type DiaryStatKind = keyof typeof sources;

async function lock(manager: EntityManager, userId: number, traceId: string) {
  // Serialize creation and usage backfill; history is committed before backfill.
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `diary-stat-input:${userId}:${traceId}`,
  ]);
}

async function readInput(
  manager: EntityManager,
  userId: number,
  traceId: string,
  operation: string,
) {
  const usage = await manager.getRepository(TokenUsageHistory).find({
    where: { user: { id: userId }, traceId, operation, estimated: false },
    select: { input: true, inputCredits: true },
  });
  if (!usage.length) return { inputTokens: null, inputCredits: null };
  return {
    inputTokens: usage.reduce((sum, row) => sum + row.input, 0),
    inputCredits: usage.reduce((sum, row) => sum + row.inputCredits, 0),
  };
}

export async function createDiaryStat(
  dataSource: DataSource,
  kind: DiaryStatKind,
  user: User,
  data: CreateDiaryStatDto = {},
) {
  const { entity, operation } = sources[kind];
  const traceId = data.aiTraceId ?? null;
  return dataSource.transaction(async (manager) => {
    const repository = manager.getRepository<StatRow>(entity);
    if (traceId) {
      await lock(manager, user.id, traceId);
      const existing = await repository.findOneBy({
        user: { id: user.id },
        aiTraceId: traceId,
      });
      if (existing) {
        // A replay may add the missing link, but cannot reassign its source.
        if (!existing.entryId && data.entryId) {
          await repository.update(existing.id, { entryId: data.entryId });
          existing.entryId = data.entryId;
        }
        return { stat: existing, created: false };
      }
    }
    const measuredInput = traceId
      ? await readInput(manager, user.id, traceId, operation)
      : { inputTokens: null, inputCredits: null };
    const input =
      measuredInput.inputTokens === null && data.aiRequested === false
        ? { inputTokens: 0, inputCredits: 0 }
        : measuredInput;
    const stat = await repository.save(
      repository.create({
        user,
        entryId: data.entryId ?? null,
        aiTraceId: traceId,
        ...input,
        ...(kind === 'checkin' || kind === 'checkin-dialog'
          ? { checkinName: data.checkinName ?? null }
          : {}),
      }),
    );
    return { stat, created: true };
  });
}

/** Called after token history commits; never calculates prices or charges credits. */
export async function refreshDiaryStatAiInput(
  manager: EntityManager,
  userId: number,
  traceId: string | null,
  operation: string | null,
) {
  const source = Object.values(sources).find(
    (value) => value.operation === operation,
  );
  if (!source || !traceId) return;
  await manager.transaction(async (transaction) => {
    await lock(transaction, userId, traceId);
    const input = await readInput(
      transaction,
      userId,
      traceId,
      source.operation,
    );
    await transaction
      .getRepository<StatRow>(source.entity)
      .update({ user: { id: userId }, aiTraceId: traceId }, input);
  });
}

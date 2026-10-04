import { Column, Index } from 'typeorm';

/** Null means unavailable (old client/history, pending or unobserved usage). */
export abstract class DiaryStatAiInput {
  /** Local source entry/check-in ID; always group together with the owner. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  entryId: string | null;

  @Column({ type: 'int', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'int', nullable: true })
  inputCredits: number | null;

  /** Links the creation event to existing server token history, in either order. */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  aiTraceId: string | null;
}

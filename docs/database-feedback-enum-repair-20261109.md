# Local feedback enum repair — 9 November 2026

Startup failed in TypeORM schema synchronization with PostgreSQL's 1600-column limit. `positive_negative_ai_model_answers` had nine live columns and 1591 dropped column slots. The generated enum-array type name was truncated; TypeORM could not match it to its base enum and repeatedly treated `unhelpfulAnswerDescriptions` as requiring drop/add.

The entity now declares the short `enumName: positive_negative_answer_reasons_enum`. Migration `1794230400000-FixAnswerFeedbackEnumName.ts` identifies the existing base and array types through catalog OIDs and renames them in place. It refuses name collisions and an unexpected existing table shape. It does not drop/recreate the column or table. Its down method refuses restoring the known broken name.

Applied locally in a transaction with a before/after row fingerprint and table/column/type identity checks. The table had zero rows at repair time; identity and content checks passed. Executing migration up twice was safe. A read-only TypeORM inspection then recognized the enum array correctly and reported no changed columns for the inspected entity metadata. The existing dev watcher restarted; its Node process listened on IPv4 port 3001 and health returned `{"status":"ok"}`.

The direct local repair did not insert a migration-history row; the migration remains idempotent for the regular runner. Production was not changed. For another affected database, apply the rename before starting entity synchronization with the new enum name, using the project's controlled migration procedure. Do not rely on synchronization to migrate this broken type name safely.

Dropped slots remain allocated (1600 total). This repair stops further replacement attempts but does not reclaim slots. Adding a column to this table later requires a separately planned, data-preserving rebuild. No habit, entry, planner, account or notification data was modified.

PostgreSQL reference: https://www.postgresql.org/docs/16/limits.html (dropped columns count toward the limit).

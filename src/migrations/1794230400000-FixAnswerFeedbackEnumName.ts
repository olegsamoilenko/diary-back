import { MigrationInterface, QueryRunner } from 'typeorm';

/** Rename the existing enum, preserving column/type OIDs and all feedback rows. */
export class FixAnswerFeedbackEnumName1794230400000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
DECLARE
  enum_oid oid;
  array_oid oid;
  schema_name text;
  enum_name text;
  array_name text;
  target_name constant text := 'positive_negative_answer_reasons_enum';
BEGIN
  SELECT base.oid, arr.oid, ns.nspname, base.typname, arr.typname
  INTO enum_oid, array_oid, schema_name, enum_name, array_name
  FROM pg_attribute a
  JOIN pg_class tbl ON tbl.oid = a.attrelid
  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  JOIN pg_type arr ON arr.oid = a.atttypid
  JOIN pg_type base ON base.oid = arr.typelem AND base.typtype = 'e'
  WHERE ns.nspname = current_schema()
    AND tbl.relname = 'positive_negative_ai_model_answers'
    AND a.attname = 'unhelpfulAnswerDescriptions' AND NOT a.attisdropped;
  IF enum_oid IS NULL THEN
    IF to_regclass('positive_negative_ai_model_answers') IS NOT NULL THEN
      RAISE EXCEPTION 'Feedback enum array column not found; refusing a destructive repair';
    END IF;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname=schema_name AND t.typname=target_name AND t.oid<>enum_oid)
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname=schema_name AND t.typname='_' || target_name AND t.oid<>array_oid) THEN
    RAISE EXCEPTION 'Feedback enum target name already belongs to another type';
  END IF;
  IF enum_name <> target_name THEN
    EXECUTE format('ALTER TYPE %I.%I RENAME TO %I', schema_name, enum_name, target_name);
  END IF;
  SELECT typname INTO array_name FROM pg_type WHERE oid=array_oid;
  IF array_name <> '_' || target_name THEN
    EXECUTE format('ALTER TYPE %I.%I RENAME TO %I', schema_name, array_name, '_' || target_name);
  END IF;
END $$`);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Refusing to restore the truncated enum name that recreates feedback columns',
      ),
    );
  }
}

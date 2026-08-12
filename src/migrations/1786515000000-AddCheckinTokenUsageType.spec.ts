import { describe, expect, it, jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddCheckinTokenUsageType1786515000000 } from './1786515000000-AddCheckinTokenUsageType';

describe('AddCheckinTokenUsageType1786515000000', () => {
  it('adds the checkin enum value and reclassifies known check-in responses', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (statement: string) => {
      statements.push(statement);
    });
    const migration = new AddCheckinTokenUsageType1786515000000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain("'checkin'");
    expect(sql).toContain('ALTER COLUMN "type" TYPE');
    expect(sql).toContain('SET "type" = \'checkin\'');
    expect(sql).toContain('"operation" = \'generate_checkin_response\'');
  });

  it('maps check-ins back to entries before removing the enum value', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (statement: string) => {
      statements.push(statement);
    });
    const migration = new AddCheckinTokenUsageType1786515000000();

    await migration.down({ query } as unknown as QueryRunner);

    expect(statements[0]).toContain('SET "type" = \'entry\'');
    expect(statements[0]).toContain('WHERE "type" = \'checkin\'');
    expect(statements.join('\n')).toContain('ALTER COLUMN "type" TYPE');
  });
});

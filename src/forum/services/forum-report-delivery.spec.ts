import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));
jest.mock('axios', () => ({ post: jest.fn() }));
import axios from 'axios';
import { ForumReportsService } from './forum-reports.service';
import { ForumReport } from '../entities/forum-report.entity';
import { ForumReportTargetType } from '../types/forum-report-target-type.enum';
import { ForumReportReason } from '../types/forum-report-reason.enum';

describe('NA36 report commit and Telegram delivery', () => {
  let service: ForumReportsService;
  let reports: any;
  let source: any;
  let commit: any;
  let stored: any[];
  let failCommit: boolean;
  const originalEnv = process.env;
  const dto = {
    targetType: ForumReportTargetType.TOPIC,
    targetId: 'topic',
    reason: ForumReportReason.SPAM,
    details: 'Test report',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      TELEGRAM_FORUM_REPORTS_BOT_TOKEN: 'test',
      TELEGRAM_FORUM_REPORTS_CHAT_ID: 'test',
    };
    (axios.post as jest.Mock<any>).mockResolvedValue({ data: { ok: true } });
    stored = [];
    failCommit = false;
    let pending: any;
    reports = {
      findOne: jest.fn<any>(async () => stored[0] ?? null),
      create: (data: any) => data,
      save: jest.fn<any>(async (data: any) => {
        pending = { ...data, id: 'report' };
        return pending;
      }),
    };
    const other: any = {
      exists: jest.fn<any>().mockResolvedValue(true),
      findOne: jest.fn<any>().mockResolvedValue({
        id: 'topic',
        title: 'Title',
        content: 'Text',
        authorId: 2,
        username: 'Test',
      }),
      update: jest.fn<any>().mockResolvedValue({ affected: 1 }),
    };
    commit = jest.fn<any>(() => {
      if (failCommit) throw new Error('commit failure');
      stored.push(pending);
    });
    source = {
      transaction: async (work: any) => {
        const result = await work({
          getRepository: (entity: any) =>
            entity === ForumReport ? reports : other,
        });
        commit();
        return result;
      },
    };
    service = new ForumReportsService(reports, other, other, other, source);
  });
  afterEach(() => {
    process.env = originalEnv;
  });
  it('returns the saved report despite rejected Telegram and retains duplicate protection', async () => {
    (axios.post as jest.Mock<any>).mockRejectedValue(new Error('transport'));
    await expect(service.createReport(1, dto)).resolves.toMatchObject({
      id: 'report',
    });
    expect(stored).toHaveLength(1);
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      (axios.post as jest.Mock).mock.invocationCallOrder[0],
    );
    await expect(service.createReport(1, dto)).rejects.toMatchObject({
      response: { code: 'FORUM_REPORT_ALREADY_EXISTS' },
    });
    expect(reports.save).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('returns without waiting for Telegram', async () => {
    let finish!: (value: unknown) => void;
    (axios.post as jest.Mock<any>).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    try {
      await expect(service.createReport(1, dto)).resolves.toMatchObject({
        id: 'report',
      });
    } finally {
      finish({ data: { ok: true } });
    }
  });
  it('does not notify or report success when DB save fails', async () => {
    reports.save.mockRejectedValue(new Error('write failed'));
    await expect(service.createReport(1, dto)).rejects.toThrow('write failed');
    expect(axios.post).not.toHaveBeenCalled();
    expect(stored).toHaveLength(0);
  });
  it('does not notify after commit failure', async () => {
    failCommit = true;
    await expect(service.createReport(1, dto)).rejects.toThrow(
      'commit failure',
    );
    expect(axios.post).not.toHaveBeenCalled();
    expect(stored).toHaveLength(0);
  });
  it('allows one successful retry after a failed commit', async () => {
    failCommit = true;
    await expect(service.createReport(1, dto)).rejects.toThrow();
    failCommit = false;
    await expect(service.createReport(1, dto)).resolves.toMatchObject({
      id: 'report',
    });
    expect(stored).toHaveLength(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});

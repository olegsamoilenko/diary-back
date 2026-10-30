import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import * as ts from 'typescript';
import {
  sendForumFeedTelegram,
  sendForumModerationTelegram,
  sendForumReportsTelegram,
} from './send-telegram';
import { formatForumModerationBlockedTelegram } from '../forum-moderation/utils/telegram-moderation-formatter';

jest.mock('axios', () => ({ post: jest.fn() }));
describe('NA36 optional community Telegram delivery', () => {
  const originalEnv = process.env;
  const senders = [
    sendForumFeedTelegram,
    sendForumModerationTelegram,
    sendForumReportsTelegram,
  ];
  let warn: any;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    for (const channel of ['FEED', 'MODERATION', 'REPORTS']) {
      process.env[`TELEGRAM_FORUM_${channel}_BOT_TOKEN`] = 'private-bot';
      process.env[`TELEGRAM_FORUM_${channel}_CHAT_ID`] = 'private-chat';
    }
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    (axios.post as jest.Mock<any>).mockResolvedValue({ data: { ok: true } });
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });
  it.each(senders)(
    '%p preserves HTML formatting and bounds only the transport',
    async (send) => {
      await send(() => '<b>Test</b> &amp; text');
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        {
          chat_id: 'private-chat',
          text: '<b>Test</b> &amp; text',
          parse_mode: 'HTML',
        },
        { timeout: 30_000 },
      );
    },
  );
  it.each(senders)(
    '%p catches transport errors without retry or sensitive logging',
    async (send) => {
      (axios.post as jest.Mock<any>).mockRejectedValue({
        message: 'private-text',
        config: { url: 'private-bot', data: 'private-chat' },
      });
      await expect(send('private-text')).resolves.toBeUndefined();
      expect(axios.post).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('delivery failed');
      expect(logged).not.toMatch(/private-(text|bot|chat)/);
    },
  );
  it.each(senders)('%p catches synchronous formatter failure', async (send) => {
    await expect(
      send(() => {
        throw new Error('invalid message');
      }),
    ).resolves.toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('missing configuration does not send a request or reject', async () => {
    delete process.env.TELEGRAM_FORUM_REPORTS_BOT_TOKEN;
    await expect(sendForumReportsTelegram('test')).resolves.toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('does not leak a detached rejection even if the logger also fails', async () => {
    (axios.post as jest.Mock<any>).mockRejectedValue(new Error('transport'));
    warn.mockImplementation(() => {
      throw new Error('sink');
    });
    await expect(sendForumReportsTelegram('test')).resolves.toBeUndefined();
  });
  it('escapes model-produced userMessage while retaining the template HTML', () => {
    const message = formatForumModerationBlockedTelegram({
      targetType: 'topic',
      actionType: 'create',
      content: 'text',
      authorId: 1,
      authorNickname: 'Test',
      decision: 'BLOCK',
      ruleCode: 'test',
      riskScore: 1,
      reason: null,
      signals: [],
      userMessage: '<b>text & test</b>',
    });
    expect(message).toContain(
      '<code>&lt;b&gt;text &amp; test&lt;/b&gt;</code>',
    );
    expect(message).toContain('<b>User message:</b>');
  });
  it('survives rejected detached delivery under strict Node rejection policy', () => {
    // Execute the actual shared sender in an isolated child; Axios is a synthetic rejection.
    const compiled = ts.transpileModule(
      readFileSync(require.resolve('./send-telegram'), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    ).outputText;
    const script = `const Module=require('module'); const old=Module._load; Module._load=function(id,...args){ if(id==='axios')return {post:()=>Promise.reject(new Error('synthetic'))}; if(id==='@nestjs/common')return {Logger:class{warn(){}}}; return old.call(this,id,...args);}; process.env.TELEGRAM_FORUM_REPORTS_BOT_TOKEN='test';process.env.TELEGRAM_FORUM_REPORTS_CHAT_ID='test'; const m={exports:{}};new Function('require','module','exports',${JSON.stringify(compiled)})(require,m,m.exports); void m.exports.sendForumReportsTelegram('test'); setTimeout(()=>console.log('survived'),20);`;
    const child = spawnSync(
      process.execPath,
      ['--unhandled-rejections=strict', '-e', script],
      { encoding: 'utf8', timeout: 10_000 },
    );
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('survived');
    expect(child.stderr).toBe('');
  });
});

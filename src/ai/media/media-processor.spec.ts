import { jest, describe, it, expect, afterEach } from '@jest/globals';
jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
import { execFile } from 'node:child_process';
import { MediaProcessor } from './media-processor';

describe('media process completion', () => {
  const run = () =>
    (
      new MediaProcessor() as unknown as {
        run: (binary: string, args: string[]) => Promise<unknown>;
      }
    ).run('ffprobe', ['input']);

  afterEach(() => {
    jest.resetAllMocks();
  });

  it.each<[Record<string, unknown>, string]>([
    [{ code: 'ENOENT' }, 'MEDIA_PROCESSOR_UNAVAILABLE'],
    [{ killed: true, signal: 'SIGTERM' }, 'MEDIA_PROCESSING_TIMEOUT'],
    [{ code: 1 }, 'MEDIA_DECODE_FAILED'],
    [
      {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        killed: true,
        signal: 'SIGTERM',
      },
      'MEDIA_DECODE_FAILED',
    ],
  ])('classifies a real process failure %j', async (error, message) => {
    (
      execFile as unknown as jest.Mock<
        (
          binary: string,
          args: string[],
          options: { timeout: number },
          callback: (error: unknown) => void,
        ) => void
      >
    ).mockImplementation((_binary, _args, options, callback) => {
      expect(options.timeout).toBe(300_000);
      callback(error);
    });
    await expect(run()).rejects.toThrow(message);
  });
});

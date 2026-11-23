import { expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { LogsService } from 'src/logs/logs.service';
import { ServerHttpLoggerMiddleware } from './server-http-logger.middleware';

it.each([false, true])(
  'records the request once when response finished=%s',
  (finished) => {
    const createServerHttpFail = jest.fn(async () => '1');
    const middleware = new ServerHttpLoggerMiddleware({
      createServerHttpFail,
    } as unknown as LogsService);
    const req = {
      method: 'GET',
      originalUrl: '/calendar',
      headers: {},
      requestId: 'trace-7',
    };
    const res = Object.assign(new EventEmitter(), {
      statusCode: finished ? 503 : 200,
      writableFinished: finished,
      locals: {},
    });
    middleware.use(
      req as unknown as Request,
      res as unknown as Response,
      jest.fn(),
    );
    if (finished) res.emit('finish');
    res.emit('close');
    expect(createServerHttpFail).toHaveBeenCalledTimes(1);
    expect(createServerHttpFail).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'trace-7',
        status: finished ? 503 : 499,
        meta: expect.objectContaining({
          failureKind: finished
            ? 'http_server_error'
            : 'connection_closed_before_finish',
        }),
      }),
      expect.any(Object),
    );
  },
);

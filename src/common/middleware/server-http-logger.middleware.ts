import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LogsService } from 'src/logs/logs.service';
import { shouldReportAiHttpError } from 'src/ai-errors/ai-error-reporter.service';

type RequestContext = {
  user?: Record<string, unknown>;
  requestId?: unknown;
};

type ErrorResponseLocals = {
  __err?: {
    status?: number;
    errorName?: string | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    stack?: string | null;
  };
};

function safeJsonClone(value: unknown): unknown {
  try {
    if (value == null) return null;
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return null;
  }
}

function normalizeIdentifier(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

@Injectable()
export class ServerHttpLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logsService: LogsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();

    res.once('finish', () => {
      const status = res.statusCode || 200;
      if (status < 400) return;

      const full = req.originalUrl || req.url || '';
      const path = full.split('?')[0] || '/';

      const durationMs = Date.now() - startedAt;

      const xff = req.headers['x-forwarded-for'];
      const ip =
        (typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined) ||
        req.ip ||
        req.socket?.remoteAddress ||
        null;

      const ua =
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null;

      const origin =
        typeof req.headers['origin'] === 'string'
          ? req.headers['origin']
          : null;

      const referrerHeader = req.headers.referrer;
      const referer =
        typeof req.headers['referer'] === 'string'
          ? req.headers['referer']
          : typeof referrerHeader === 'string'
            ? referrerHeader
            : null;

      const requestContext = req as Request & RequestContext;
      const user = requestContext.user ?? {};
      const userId = normalizeIdentifier(user.id ?? user.userId);
      const userUuidValue = user.uuid ?? user.userUuid;
      const userUuid = typeof userUuidValue === 'string' ? userUuidValue : null;

      const requestId =
        typeof requestContext.requestId === 'string'
          ? requestContext.requestId
          : null;

      const err = (res.locals as unknown as ErrorResponseLocals).__err;
      const isAiServerProblem = shouldReportAiHttpError({
        path,
        status,
        userId,
      });

      void this.logsService
        .createServerHttpFail({
          ts: Date.now(),
          level: status >= 500 || isAiServerProblem ? 'error' : 'warn',
          kind: 'http',
          status,
          method: req.method,
          path,
          query: safeJsonClone(req.query) ?? undefined,
          durationMs,
          userId,
          userUuid,
          requestId: requestId ?? undefined,
          ip: ip ?? undefined,
          ua: ua ?? undefined,
          origin: origin ?? undefined,
          referer: referer ?? undefined,

          errorName: err?.errorName ?? undefined,
          errorMessage: err?.errorMessage ?? undefined,
          stack: err?.stack ?? undefined,

          meta: {
            from: 'finish-mw',
            hasErr: !!err,
            errorCode: err?.errorCode ?? undefined,
          },
        })
        .catch(() => {
          // Keep telemetry persistence independent of the HTTP response.
        });
    });

    next();
  }
}

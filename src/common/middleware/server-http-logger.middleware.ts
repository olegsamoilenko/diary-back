import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LogsService } from 'src/logs/logs.service';

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
      const referer =
        typeof req.headers['referer'] === 'string'
          ? req.headers['referer']
          : typeof (req.headers as any).referrer === 'string'
            ? (req.headers as any).referrer
            : null;

      // якщо user вже є (після auth middleware/guard може не бути)
      const user: any = (req as any).user;
      const userId = user?.id ?? user?.userId ?? null;
      const userUuid = user?.uuid ?? user?.userUuid ?? null;

      void this.logsService
        .createServerHttpFail({
          ts: Date.now(),
          level: status >= 500 ? 'error' : 'warn',
          kind: 'http',
          status,
          method: req.method,
          path,
          query: req.query ?? undefined,
          durationMs,
          userId,
          userUuid,
          requestId: (req as any).requestId ?? undefined,
          ip: ip ?? undefined,
          ua: ua ?? undefined,
          origin: origin ?? undefined,
          referer: referer ?? undefined,
          // errorName/errorMessage тут можуть бути undefined — це ок
          meta: {
            from: 'finish-mw',
          },
        })
        .catch((e) => console.error('createServerHttpFail failed', e));
    });

    next();
  }
}

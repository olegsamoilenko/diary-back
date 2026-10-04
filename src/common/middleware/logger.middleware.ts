import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();
    const path = (req.originalUrl || req.url || '/').split('?')[0];
    res.once('finish', () => {
      this.logger.log(
        `${req.method} ${path} ${res.statusCode} ${Date.now() - startedAt}ms`,
      );
    });
    next();
  }
}

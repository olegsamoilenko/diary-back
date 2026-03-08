import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`[REQ] ${req.method} ${req.originalUrl}`, {
      query: req.query,
      body: req.body,
      params: req.params,
    });

    next();
  }
}

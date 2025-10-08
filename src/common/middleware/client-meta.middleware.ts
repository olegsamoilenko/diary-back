import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    clientIp?: string | null;
    clientUa?: string | null;
  }
}

@Injectable()
export class ClientMetaMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const fwd = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    req.clientIp = fwd || req.ip || null;
    req.clientUa =
      (req.headers['x-client-ua'] as string) ||
      req.headers['user-agent'] ||
      null;
    next();
  }
}

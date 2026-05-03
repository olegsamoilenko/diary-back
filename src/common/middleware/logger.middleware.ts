import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { inspect } from 'node:util';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // console.log(
    //   `[REQ] ${req.method} ${req.originalUrl}\n` +
    //     inspect(
    //       {
    //         query: req.query,
    //         body: req.body,
    //         params: req.params,
    //       },
    //       {
    //         depth: null,
    //         colors: false,
    //         compact: false,
    //       },
    //     ),
    // );

    next();
  }
}

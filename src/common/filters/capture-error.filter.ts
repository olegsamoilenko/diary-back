import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

function normalizeMessage(msg: any): string | null {
  if (msg == null) return null;
  if (Array.isArray(msg)) return msg.map(String).join('; ');
  if (typeof msg === 'string') return msg;
  return String(msg);
}

@Catch()
export class CaptureErrorFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorName = exception?.name ?? null;

    let errorMessage: string | null = null;

    if (exception instanceof HttpException) {
      const resp: any = exception.getResponse();

      errorMessage =
        normalizeMessage(resp?.message) ??
        normalizeMessage(resp?.error) ??
        normalizeMessage(exception?.message);
    } else {
      errorMessage = normalizeMessage(exception?.message);
    }

    const stack = typeof exception?.stack === 'string' ? exception.stack : null;

    (res.locals as any).__err = {
      status,
      errorName,
      errorMessage,
      stack,
    };

    if (exception instanceof HttpException) {
      return res.status(status).json(exception.getResponse());
    }

    return res.status(status).json({
      statusCode: status,
      message: 'Internal server error',
    });
  }
}

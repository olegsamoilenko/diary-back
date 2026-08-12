import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AiErrorReporterService } from 'src/ai-errors/ai-error-reporter.service';

type RequestContext = {
  user?: Record<string, unknown>;
  requestId?: unknown;
};

type ErrorResponseLocals = {
  __err?: {
    status: number;
    errorName: string | null;
    errorMessage: string | null;
    errorCode: string | null;
    stack: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeMessage(msg: unknown): string | null {
  if (msg == null) return null;
  if (Array.isArray(msg)) {
    return msg
      .map((item) => normalizeMessage(item))
      .filter((item): item is string => item !== null)
      .join('; ');
  }
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg);
  try {
    return JSON.stringify(msg) || null;
  } catch {
    return null;
  }
}

function normalizeIdentifier(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

@Catch()
@Injectable()
export class CaptureErrorFilter implements ExceptionFilter {
  constructor(private readonly aiErrorReporter: AiErrorReporterService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionData = asRecord(exception);
    const errorName =
      typeof exceptionData.name === 'string' ? exceptionData.name : null;

    let errorMessage: string | null = null;

    if (exception instanceof HttpException) {
      const responseData = asRecord(exception.getResponse());

      errorMessage =
        normalizeMessage(responseData.message) ??
        normalizeMessage(responseData.error) ??
        normalizeMessage(exceptionData.message);
    } else {
      errorMessage = normalizeMessage(exceptionData.message);
    }

    const stack =
      typeof exceptionData.stack === 'string' ? exceptionData.stack : null;
    const responseBody =
      exception instanceof HttpException ? exception.getResponse() : null;
    const errorCode =
      responseBody && typeof responseBody === 'object'
        ? normalizeMessage(asRecord(responseBody).code)
        : null;

    const fullPath = req.originalUrl || req.url || '/';
    const path = fullPath.split('?')[0] || '/';
    const requestContext = req as Request & RequestContext;
    const user = requestContext.user ?? {};
    const userId = normalizeIdentifier(user.id ?? user.userId);
    const requestId =
      typeof requestContext.requestId === 'string'
        ? requestContext.requestId
        : null;

    if (this.aiErrorReporter.shouldReportHttpError({ path, status, userId })) {
      const body = asRecord(req.body as unknown);
      const model =
        typeof (body.aiModel ?? body.model) === 'string'
          ? String(body.aiModel ?? body.model)
          : null;
      this.aiErrorReporter.report({
        operation: `HTTP ${req.method} ${path}`,
        transport: 'http',
        error: exception,
        status,
        code: errorCode,
        userId,
        model,
        requestId,
      });
    }

    (res.locals as unknown as ErrorResponseLocals).__err = {
      status,
      errorName,
      errorMessage,
      errorCode,
      stack,
    };

    if (exception instanceof HttpException) {
      res.status(status).json(exception.getResponse());
      return;
    }

    res.status(status).json({
      statusCode: status,
      message: 'Internal server error',
    });
  }
}

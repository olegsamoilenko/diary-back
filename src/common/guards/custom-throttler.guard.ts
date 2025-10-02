import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface ThrottlerLimitDetailCompat {
  ttl?: number;
  limit?: number;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail?: ThrottlerLimitDetailCompat,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);

    const rawTtl = throttlerLimitDetail?.ttl;
    const ttl =
      Number.isFinite(rawTtl) && (rawTtl as number) > 0
        ? Math.ceil(rawTtl as number)
        : 60;

    res?.setHeader?.('Retry-After', String(ttl));

    await Promise.resolve();

    // console.warn('THROTTLED', {
    //   ttl: throttlerLimitDetail?.ttl,
    //   limit: throttlerLimitDetail?.limit,
    // });

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: `To many requests.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

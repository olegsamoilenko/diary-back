import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs';
import { projectForumResponse } from './forum-response-projection';

@Injectable()
export class ForumPublicResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler<unknown>) {
    return next
      .handle()
      .pipe(map((value) => projectForumResponse(value, 'public')));
  }
}

@Injectable()
export class ForumAdminResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler<unknown>) {
    return next
      .handle()
      .pipe(map((value) => projectForumResponse(value, 'admin')));
  }
}

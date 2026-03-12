import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { GeoAccessService } from './geo-access.service';

@Injectable()
export class BlockedCountriesGuard implements CanActivate {
  constructor(private readonly geoAccessService: GeoAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const result = this.geoAccessService.checkAccess(req);

    if (result.blocked) {
      this.geoAccessService.logBlocked({
        path: req.path,
        method: req.method,
        ip: result.ip,
        country: result.country,
      });

      throw new ForbiddenException({
        code: 'COUNTRY_BLOCKED',
        country: result.country,
        message: 'Nemory is not available in your country.',
      });
    }

    return true;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class GeoAccessService {
  private readonly logger = new Logger(GeoAccessService.name);

  private readonly defaultBlockedCountries = (
    process.env.BLOCKED_COUNTRIES ?? 'RU,BY'
  )
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

  getClientIp(req: Request): string | null {
    const xForwardedFor = req.headers['x-forwarded-for'];

    if (typeof xForwardedFor === 'string' && xForwardedFor.length > 0) {
      return xForwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      return xForwardedFor[0];
    }

    const realIp = req.headers['x-real-ip'];

    if (typeof realIp === 'string' && realIp.length > 0) {
      return realIp.trim();
    }

    return req.ip || req.socket?.remoteAddress || null;
  }

  getCountryFromRequest(req: Request): string | null {
    const country = req.headers['x-country-code'];

    if (typeof country === 'string' && country.trim()) {
      return country.trim().toUpperCase();
    }

    return null;
  }

  getDefaultBlockedCountries(): string[] {
    return this.defaultBlockedCountries;
  }

  isCountryBlocked(
    country: string | null,
    blockedCountries?: string[],
  ): boolean {
    if (!country) return false;

    const denylist = blockedCountries?.length
      ? blockedCountries.map((c) => c.toUpperCase())
      : this.defaultBlockedCountries;

    return denylist.includes(country.toUpperCase());
  }

  checkAccess(req: Request, blockedCountries?: string[]) {
    const ip = this.getClientIp(req);
    const country = this.getCountryFromRequest(req);

    const denylist = blockedCountries?.length
      ? blockedCountries.map((c) => c.toUpperCase())
      : this.defaultBlockedCountries;

    return {
      ip,
      country,
      blocked: this.isCountryBlocked(country, denylist),
      denylist,
    };
  }

  logBlocked(params: {
    path?: string;
    method?: string;
    ip: string | null;
    country: string | null;
  }) {
    this.logger.warn('country_blocked', {
      path: params.path ?? null,
      method: params.method ?? null,
      ip: params.ip,
      country: params.country,
    });
  }
}

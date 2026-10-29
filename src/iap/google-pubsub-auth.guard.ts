import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { Request } from 'express';
import { PubSubPushEnvelope, RtdnPayload } from './types/subscription';
import { decodeBase64Json } from './utils/rtdn';

@Injectable()
export class GooglePubSubAuthGuard implements CanActivate {
  private readonly client = new OAuth2Client();
  private readonly logger = new Logger(GooglePubSubAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const audience = this.config.get<string>('GOOGLE_PUBSUB_AUDIENCE')?.trim();
    const serviceAccount = this.config
      .get<string>('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL')
      ?.trim();
    if (!audience || !serviceAccount) {
      this.logger.error('[IAP RTDN] push authentication configuration missing');
      throw new ServiceUnavailableException(
        'Pub/Sub authentication unavailable',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const authorization = req.headers.authorization;
    const token =
      typeof authorization === 'string'
        ? /^Bearer ([^\s]+)$/i.exec(authorization)?.[1]
        : undefined;
    if (!token) {
      throw new UnauthorizedException('Google Pub/Sub authentication required');
    }

    let payload: TokenPayload | undefined;
    try {
      // Google's verifier checks signature, issuer, audience and token times.
      // The client caches Google's public certificates; no purchase polling.
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      // Library errors can contain the complete JWT. Never log/rethrow them.
      throw new UnauthorizedException('Invalid Google Pub/Sub identity');
    }
    if (payload?.email !== serviceAccount || payload.email_verified !== true) {
      throw new UnauthorizedException('Unexpected Google Pub/Sub identity');
    }

    const body = req.body as PubSubPushEnvelope | undefined;
    const data = body?.message?.data;
    const notification =
      typeof data === 'string' ? decodeBase64Json<RtdnPayload>(data) : null;
    const packageName =
      this.config.get<string>('GOOGLE_PLAY_PACKAGE_NAME')?.trim() ||
      'com.soniac12.nemory';
    if (notification?.packageName !== packageName) {
      throw new BadRequestException('Invalid Google Play notification package');
    }
    return true;
  }
}

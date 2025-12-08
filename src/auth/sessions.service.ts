import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import { User } from 'src/users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { bcryptHashToken, bcryptVerifyToken } from 'src/common/utils/bctypto';
import { ConfigService } from '@nestjs/config';
import nacl from 'tweetnacl';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';

type Tokens = { accessToken: string; refreshToken: string; deviceId: string };

function b64ToU8(b64: string): Uint8Array {
  return Buffer.from(b64, 'base64');
}

@Injectable()
export class SessionsService {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(UserSession)
    private userSessionsRepository: Repository<UserSession>,
    private readonly configService: ConfigService,
  ) {}

  private createOpaqueRefresh(): string {
    return `${randomUUID()}.${randomBytes(32).toString('hex')}`;
  }

  async issueTokens(
    user: User,
    deviceId?: string,
    devicePubKey?: string | null,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<Tokens> {
    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    // TODO: Переробити з точки зору безпеки, щоб там не було сенсетів данних
    const accessToken = await this.jwtService.signAsync(
      { ...user },
      {
        expiresIn: Number(expiresIn),
      },
    );

    const refreshToken = this.createOpaqueRefresh();
    const refreshTokenHash = await bcryptHashToken(refreshToken);
    const finalDeviceId = deviceId ?? randomUUID();

    let session = await this.userSessionsRepository.findOne({
      where: { user: { id: user.id }, deviceId: finalDeviceId },
    });
    if (!session) {
      session = this.userSessionsRepository.create({
        user,
        userId: user.id,
        deviceId: finalDeviceId,
        refreshTokenHash,
        devicePubKey: devicePubKey ?? null,
        userAgent: userAgent ?? null,
        ip: ip ?? null,
      });
    } else {
      session.refreshTokenHash = refreshTokenHash;
      if (deviceId) session.deviceId = deviceId;
      if (devicePubKey) session.devicePubKey = devicePubKey;
      if (userAgent) session.userAgent = userAgent;
      if (ip) session.ip = ip;
    }
    await this.userSessionsRepository.save(session);

    return { accessToken, refreshToken, deviceId: finalDeviceId };
  }

  private verifySignatureOrThrow(
    session: UserSession,
    body: {
      userId: number;
      deviceId: string;
      refreshToken: string;
      ts: number;
    },
    sigB64: string,
  ) {
    const now = Date.now();
    const skewMs = 2 * 60 * 1000;
    if (Math.abs(now - body.ts) > skewMs) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Stale or future timestamp',
        'Stale or future timestamp.',
        'STALE_OR_FUTURE_TIMESTAMP',
      );
    }

    if (!session.devicePubKey) {
      return 'MISSING_PUBKEY';
    }

    const msg = Buffer.from(JSON.stringify(body), 'utf8');
    const ok = nacl.sign.detached.verify(
      new Uint8Array(msg),
      b64ToU8(sigB64),
      b64ToU8(session.devicePubKey),
    );
    if (!ok) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid device signature',
        'Invalid device signature.',
        'INVALID_DEVICE_SIGNATURE',
      );
    }
    return 'OK';
  }

  async refresh(
    userId: number,
    deviceId: string,
    presentedRefresh: string,
    ts: number,
    sigB64: string,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<Tokens> {
    const session = await this.userSessionsRepository.findOne({
      where: { userId, deviceId },
      relations: { user: true },
    });
    if (!session) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Session not found',
        'Session not found. Please contact support',
        'SESSION_NOT_FOUND',
      );
    }

    const sigState = this.verifySignatureOrThrow(
      session,
      { userId, deviceId, refreshToken: presentedRefresh, ts },
      sigB64,
    );

    const ok = await bcryptVerifyToken(
      presentedRefresh,
      session.refreshTokenHash,
    );

    if (sigState === 'MISSING_PUBKEY') {
      if (!ok) {
        throwError(
          HttpStatus.UNAUTHORIZED,
          'Invalid refresh token',
          'Invalid refresh token. Please contact support.',
          'INVALID_REFRESH_TOKEN',
        );
      }
    }

    if (!ok) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid refresh token',
        'Invalid refresh token. Please contact support.',
        'INVALID_REFRESH_TOKEN',
      );
    }

    return this.issueTokens(
      session.user,
      deviceId,
      /* devicePubKey? */ null,
      userAgent ?? null,
      ip ?? null,
    );
  }

  async registerDeviceKey(
    userId: number,
    deviceId: string,
    devicePubKey: string,
  ) {
    const session = await this.userSessionsRepository.findOne({
      where: { userId, deviceId },
    });
    if (!session) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Session not found',
        'Session not found. Please contact support',
        'SESSION_NOT_FOUND',
      );
    }
    session.devicePubKey = devicePubKey;
    session.deviceKeyAlg = 'ed25519';
    await this.userSessionsRepository.save(session);
    return { ok: true };
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.userSessionsRepository.delete({ userId });
  }
}

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import { User } from 'src/users/entities/user.entity';
import {
  RefreshTokenHistoryEntry,
  UserSession,
} from './entities/user-session.entity';
import { bcryptHashToken, bcryptVerifyToken } from 'src/common/utils/bctypto';
import { ConfigService } from '@nestjs/config';
import nacl from 'tweetnacl';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { UsersService } from 'src/users/users.service';
import { SaltService } from '../salt/salt.service';
import { generateHash } from 'src/common/utils/generateHash';

type Tokens = { accessToken: string; refreshToken: string; deviceId: string };

const DEFAULT_REFRESH_TOKEN_GRACE_MS = 60_000;
const MAX_REFRESH_TOKEN_HISTORY = 8;

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
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly saltService: SaltService,
  ) {}

  private createOpaqueRefresh(): string {
    return `${randomUUID()}.${randomBytes(32).toString('hex')}`;
  }

  private getRefreshTokenGraceMs(): number {
    const configured = Number(
      this.configService.get('JWT_REFRESH_TOKEN_GRACE_MS'),
    );

    return Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_REFRESH_TOKEN_GRACE_MS;
  }

  private async createTokenPair(user: User, nextRefreshToken?: string) {
    const expiresIn: number =
      this.configService.get('JWT_ACCESS_TOKEN_TTL') || 604800;

    // TODO: Переробити з точки зору безпеки, щоб там не було сенсетів данних
    const accessToken = await this.jwtService.signAsync(
      { ...user },
      {
        expiresIn: Number(expiresIn),
      },
    );
    const refreshToken = nextRefreshToken ?? this.createOpaqueRefresh();
    const refreshTokenHash = await bcryptHashToken(refreshToken);

    return { accessToken, refreshToken, refreshTokenHash };
  }

  private activeRefreshTokenHistory(
    history: RefreshTokenHistoryEntry[] | null | undefined,
    now: number,
  ): RefreshTokenHistoryEntry[] {
    if (!Array.isArray(history)) return [];

    return history
      .filter(
        (entry) =>
          typeof entry?.hash === 'string' &&
          Number.isFinite(entry?.validUntil) &&
          entry.validUntil > now,
      )
      .slice(-(MAX_REFRESH_TOKEN_HISTORY - 1));
  }

  private async refreshTokenMatches(
    presentedRefresh: string,
    session: UserSession,
    now: number,
  ): Promise<boolean> {
    if (await bcryptVerifyToken(presentedRefresh, session.refreshTokenHash)) {
      return true;
    }

    const history = this.activeRefreshTokenHistory(
      session.refreshTokenHistory,
      now,
    );
    for (const entry of history) {
      if (await bcryptVerifyToken(presentedRefresh, entry.hash)) return true;
    }

    return false;
  }

  async issueTokens(
    user: User,
    deviceId?: string,
    devicePubKey?: string | null,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<Tokens> {
    const { accessToken, refreshToken, refreshTokenHash } =
      await this.createTokenPair(user);
    const finalDeviceId = deviceId ?? randomUUID();

    // Login/recovery and refresh must serialize on the same session row.
    // Otherwise a refresh read before login can overwrite the newly issued pair.
    await this.userSessionsRepository.manager.transaction(async (manager) => {
      const sessionsRepository = manager.getRepository(UserSession);
      let session = await sessionsRepository.findOne({
        where: { userId: user.id, deviceId: finalDeviceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        session = sessionsRepository.create({
          user,
          userId: user.id,
          deviceId: finalDeviceId,
          refreshTokenHash,
          refreshTokenHistory: [],
          devicePubKey: devicePubKey ?? null,
          userAgent: userAgent ?? null,
          ip: ip ?? null,
        });
      } else {
        session.refreshTokenHash = refreshTokenHash;
        session.refreshTokenHistory = [];
        if (devicePubKey) session.devicePubKey = devicePubKey;
        if (userAgent) session.userAgent = userAgent;
        if (ip) session.ip = ip;
      }
      await sessionsRepository.save(session);
    });

    return { accessToken, refreshToken, deviceId: finalDeviceId };
  }

  private verifySignatureOrThrow(
    session: UserSession,
    body: {
      userId: number;
      deviceId: string;
      refreshToken: string;
      ts: number;
      nextRefreshToken?: string;
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
    nextRefreshToken?: string,
  ): Promise<Tokens> {
    return this.userSessionsRepository.manager.transaction(async (manager) => {
      const sessionsRepository = manager.getRepository(UserSession);
      const session = await sessionsRepository.findOne({
        where: { userId, deviceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Session not found',
          'Session not found. Please contact support',
          'SESSION_NOT_FOUND',
        );
      }

      const user = await manager.getRepository(User).findOneBy({ id: userId });
      if (!user) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found',
          'User not found. Please contact support',
          'USER_NOT_FOUND',
        );
      }

      // A client-selected replacement must be bound to the device signature.
      // Legacy unsigned sessions keep the existing server-generated protocol.
      if (nextRefreshToken !== undefined && !session.devicePubKey) {
        throw new BadRequestException({ code: 'ROTATION_DEVICE_KEY_REQUIRED' });
      }
      if (
        nextRefreshToken !== undefined &&
        !/^[a-f0-9]{64}$/.test(nextRefreshToken)
      ) {
        throw new BadRequestException('Invalid refresh rotation proposal');
      }
      this.verifySignatureOrThrow(
        session,
        {
          userId,
          deviceId,
          refreshToken: presentedRefresh,
          ts,
          ...(nextRefreshToken === undefined ? {} : { nextRefreshToken }),
        },
        sigB64,
      );

      const now = Date.now();
      const refreshMatches = await this.refreshTokenMatches(
        presentedRefresh,
        session,
        now,
      );
      if (!refreshMatches) {
        throwError(
          HttpStatus.UNAUTHORIZED,
          'Invalid refresh token',
          'Invalid refresh token. Please contact support.',
          'INVALID_REFRESH_TOKEN',
        );
      }

      const { accessToken, refreshToken, refreshTokenHash } =
        await this.createTokenPair(user, nextRefreshToken);
      const refreshTokenHistory = this.activeRefreshTokenHistory(
        session.refreshTokenHistory,
        now,
      );
      const graceMs = this.getRefreshTokenGraceMs();

      if (graceMs > 0) {
        refreshTokenHistory.push({
          hash: session.refreshTokenHash,
          validUntil: now + graceMs,
        });
      }

      session.refreshTokenHash = refreshTokenHash;
      session.refreshTokenHistory = refreshTokenHistory.slice(
        -MAX_REFRESH_TOKEN_HISTORY,
      );
      if (userAgent) session.userAgent = userAgent;
      if (ip) session.ip = ip;
      await sessionsRepository.save(session);

      return { accessToken, refreshToken, deviceId };
    });
  }

  async recoverAnon(
    userId: number,
    uuid: string,
    hash: string,
    deviceId: string,
    ts: number,
    sigB64: string,
    devicePubKey?: string | null,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<Tokens> {
    const user = await this.usersService.findByIdAndUUID(userId, uuid);
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }
    if (user.isRegistered || user.email) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User is registered',
        'User is registered',
        'USER_IS_REGISTERED',
      );
    }

    const salt = await this.saltService.getSaltByUserId(user.id);
    const expected = generateHash(uuid, salt!.value);
    if (hash !== expected) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid hash',
        'Invalid hash',
        'INVALID_HASH',
      );
    }

    let session = await this.userSessionsRepository.findOne({
      where: { userId: user.id, deviceId },
    });

    const pubKeyB64 = session?.devicePubKey ?? devicePubKey ?? null;
    if (!pubKeyB64) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Missing device pubkey',
        'Missing device pubkey',
        'MISSING_DEVICE_PUBKEY',
      );
    }

    this.verifySignatureOrThrowRaw(
      pubKeyB64,
      { userId: user.id, deviceId, uuid, hash, ts },
      sigB64,
    );

    if (!session) {
      session = this.userSessionsRepository.create({
        user,
        userId: user.id,
        deviceId,
        refreshTokenHash: await bcryptHashToken(this.createOpaqueRefresh()),
        refreshTokenHistory: [],
        devicePubKey: pubKeyB64,
        userAgent: userAgent ?? null,
        ip: ip ?? null,
      });
      await this.userSessionsRepository.save(session);
    }

    return this.issueTokens(
      user,
      deviceId,
      null,
      userAgent ?? null,
      ip ?? null,
    );
  }

  private verifySignatureOrThrowRaw(
    devicePubKeyB64: string,
    body: { ts: number } & Record<string, unknown>,
    sigB64: string,
  ) {
    const now = Date.now();
    const skewMs = 2 * 60 * 1000;
    if (Math.abs(now - body.ts) > skewMs) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Stale timestamp',
        'Stale timestamp',
        'STALE_OR_FUTURE_TIMESTAMP',
      );
    }

    const msg = Buffer.from(JSON.stringify(body), 'utf8');
    const ok = nacl.sign.detached.verify(
      new Uint8Array(msg),
      b64ToU8(sigB64),
      b64ToU8(devicePubKeyB64),
    );
    if (!ok) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid signature',
        'Invalid signature',
        'INVALID_DEVICE_SIGNATURE',
      );
    }
  }

  // async registerDeviceKey(
  //   userId: number,
  //   deviceId: string,
  //   devicePubKey: string,
  // ) {
  //   const session = await this.userSessionsRepository.findOne({
  //     where: { userId, deviceId },
  //   });
  //   if (!session) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'Session not found',
  //       'Session not found. Please contact support',
  //       'SESSION_NOT_FOUND',
  //     );
  //   }
  //   session.devicePubKey = devicePubKey;
  //   session.deviceKeyAlg = 'ed25519';
  //   await this.userSessionsRepository.save(session);
  //   return { ok: true };
  // }

  async deleteByUserId(userId: number): Promise<void> {
    await this.userSessionsRepository.delete({ userId });
  }
}

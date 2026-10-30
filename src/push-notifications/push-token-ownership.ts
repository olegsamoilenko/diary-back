import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import nacl from 'tweetnacl';
import { EntityManager, IsNull } from 'typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { SavePushTokenDto } from './dto/save-push-token.dto';
import {
  RevokePushDeviceDto,
  PushOwnershipProof,
} from './dto/push-ownership.dto';
import { UserPushToken } from './entities/user-push-token.entity';
import { PushDeviceState } from './entities/push-device-state.entity';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const lock = (manager: EntityManager, value: string) =>
  manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    value,
  ]);

function verify(proof: PushOwnershipProof, payload: unknown[]) {
  if (!proof || !Number.isSafeInteger(proof.revision) || proof.revision < 1)
    throw new BadRequestException('Invalid push ownership proof');
  const key = Buffer.from(proof.publicKey ?? '', 'base64');
  const signature = Buffer.from(proof.signature ?? '', 'base64');
  const message = JSON.stringify(payload);
  if (
    key.length !== 32 ||
    signature.length !== 64 ||
    !nacl.sign.detached.verify(Buffer.from(message), signature, key)
  )
    throw new UnauthorizedException('Invalid push ownership proof');
  return { keyHash: hash(key.toString('base64')), requestHash: hash(message) };
}

async function prepare(
  manager: EntityManager,
  proof: PushOwnershipProof,
  payload: unknown[],
  registration: boolean,
) {
  const identity = verify(proof, payload);
  await lock(manager, `push-device:${identity.keyHash}`);
  const states = manager.getRepository(PushDeviceState);
  const state = await states.findOneBy({ keyHash: identity.keyHash });
  const session = await manager.getRepository(UserSession).findOneBy({
    userId: proof.userId,
    deviceId: proof.deviceId,
  });
  const sessionVerified =
    !!session?.devicePubKey && session.devicePubKey === proof.publicKey;
  // The first registration may never have reached us before session removal.
  // Nothing is bound to this key; acknowledge a signed no-op rather than trap
  // the installation's durable revoke queue forever. Never create state here.
  if (!registration && !state && !sessionVerified) {
    return { identity, result: { success: true, stale: false } };
  }
  // Registration needs a currently authenticated, registered device. Revocation
  // may use its saved key after logout/password reset, but can only disable push.
  if (registration || !state) {
    if (!sessionVerified)
      throw new UnauthorizedException('Unknown push device');
  }
  if (state && Number(state.revision) >= proof.revision) {
    return {
      identity,
      result: {
        success:
          Number(state.revision) === proof.revision &&
          state.requestHash === identity.requestHash,
        stale:
          Number(state.revision) > proof.revision ||
          state.requestHash !== identity.requestHash,
      },
    };
  }
  await states.save({
    ...identity,
    publicKey: proof.publicKey,
    revision: String(proof.revision),
  });
  return { identity, result: null, sessionVerified };
}

export async function saveOwnedPushToken(
  manager: EntityManager,
  userId: number,
  dto: SavePushTokenDto,
) {
  const token = dto.token?.trim();
  if (!token) {
    throwError(
      HttpStatus.BAD_REQUEST,
      'Push token is empty',
      'Push token is empty',
      'PUSH_TOKEN_IS_EMPTY',
    );
  }
  const proof = dto.ownership;
  let deviceKeyHash: string | null = null;
  if (proof) {
    if (proof.userId !== userId)
      throw new UnauthorizedException('Push owner mismatch');
    const prepared = await prepare(
      manager,
      proof,
      [
        'push-register-v1',
        userId,
        proof.deviceId,
        proof.revision,
        token,
        dto.platform,
        dto.scope ?? null,
        dto.locale ?? null,
      ],
      true,
    );
    if (prepared.result) return prepared.result;
    deviceKeyHash = prepared.identity.keyHash;
  }
  await lock(manager, `push-token:${token}`);
  const tokens = manager.getRepository(UserPushToken);
  // Also detach a rotated token belonging to this installation, not its other devices.
  if (deviceKeyHash)
    await tokens.update({ deviceKeyHash, isActive: true }, { isActive: false });
  await tokens.update({ token, isActive: true }, { isActive: false });
  const existing = await tokens.findOneBy({ userId, token });
  await tokens.save(
    tokens.create({
      ...existing,
      userId,
      token,
      platform: dto.platform,
      scope: dto.scope ?? existing?.scope ?? null,
      locale: dto.locale ?? existing?.locale ?? null,
      deviceKeyHash,
      isActive: true,
    }),
  );
  return { success: true };
}

export async function revokePushDevice(
  manager: EntityManager,
  dto: RevokePushDeviceDto,
) {
  const proof = dto.ownership;
  if (!proof) throw new BadRequestException('Push ownership proof required');
  const token = dto.token?.trim() || null;
  const prepared = await prepare(
    manager,
    proof,
    ['push-revoke-v1', proof.userId, proof.deviceId, proof.revision, token],
    false,
  );
  if (prepared.result) return prepared.result;
  if (token) await lock(manager, `push-token:${token}`);
  const tokens = manager.getRepository(UserPushToken);
  await tokens.update(
    { deviceKeyHash: prepared.identity.keyHash },
    { isActive: false },
  );
  // Upgrade path for a token originally saved by an older application.
  if (token && prepared.sessionVerified)
    await tokens.update(
      { userId: proof.userId, token, deviceKeyHash: IsNull() },
      { isActive: false },
    );
  return { success: true };
}

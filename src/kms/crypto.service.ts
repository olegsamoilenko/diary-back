import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { UserKeysService } from './user-keys.service';
import { CipherBlobV1 } from './types';
import { DecryptCommand } from '@aws-sdk/client-kms';

@Injectable()
export class CryptoService {
  constructor(private readonly userKeys: UserKeysService) {}

  async encryptForUser(
    userId: number,
    scope: string, // напр., 'entry.content'
    plaintext: Buffer | string,
  ): Promise<CipherBlobV1> {
    const { dek, user } = await this.userKeys.getUserDek(userId);

    try {
      const input = Buffer.isBuffer(plaintext)
        ? plaintext
        : Buffer.from(plaintext, 'utf8');
      const iv = randomBytes(12);

      const ctx: Record<string, string> = {
        app: 'nemory',
        uid: String(user.id),
        scope,
        kver: String(user.dekVersion),
        ver: '1',
      };

      const aadBuf = Buffer.from(JSON.stringify(ctx), 'utf8');

      const cipher = createCipheriv('aes-256-gcm', dek, iv);
      cipher.setAAD(aadBuf);

      const ct = Buffer.concat([cipher.update(input), cipher.final()]);
      const tag = cipher.getAuthTag();

      const blob: CipherBlobV1 = {
        v: 1,
        alg: 'AES-256-GCM',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ct: ct.toString('base64'),
        edk: Buffer.from(user.dekEncrypted!).toString('base64'),
        ctx,
        aad: aadBuf.toString('base64'),
      };
      return blob;
    } finally {
      dek.fill(0);
    }
  }

  async decryptForUser(userId: number, blob: CipherBlobV1): Promise<Buffer> {
    if (blob.alg !== 'AES-256-GCM')
      throw new Error(`Unsupported alg: ${blob.alg}`);

    const uid = String(userId);
    const kver = String(blob.ctx?.kver ?? '1');
    const userDekCtx = { app: 'nemory', scope: 'user_dek', uid, kver };

    const dec = await this.userKeys['kms'].send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(blob.edk, 'base64'),
        EncryptionContext: userDekCtx,
        KeyId: (this.userKeys as any).keyId,
      }),
    );
    if (!dec.Plaintext) throw new Error('KMS failed to decrypt data key');
    const dek = Buffer.from(dec.Plaintext);

    try {
      const iv = Buffer.from(blob.iv, 'base64');
      const tag = Buffer.from(blob.tag, 'base64');
      const ct = Buffer.from(blob.ct, 'base64');

      const tryDecrypt = (aad?: Buffer) => {
        const d = createDecipheriv('aes-256-gcm', dek, iv);
        if (aad) d.setAAD(aad);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(ct), d.final()]);
      };

      if (blob.aad) {
        return tryDecrypt(Buffer.from(blob.aad, 'base64'));
      }

      try {
        const aad1 = blob.ctx
          ? Buffer.from(JSON.stringify(blob.ctx), 'utf8')
          : undefined;
        return tryDecrypt(aad1);
      } catch (e: any) {
        console.log('AAD decryption attempt 1 failed:', e);
      }

      if (blob.ctx) {
        const entries = Object.entries(blob.ctx).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        const canonical = JSON.stringify(Object.fromEntries(entries));
        return tryDecrypt(Buffer.from(canonical, 'utf8'));
      }

      throw new Error('Unable to authenticate data (AAD mismatch)');
    } finally {
      dek.fill(0);
    }
  }
}

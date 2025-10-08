import { Injectable } from '@nestjs/common';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export type EncryptionContext = Record<string, string>;

export type EncryptedBlob = {
  v: number;
  alg: 'AES-256-GCM';
  iv: string;
  tag: string;
  ct: string;
  edk: string;
};

@Injectable()
export class KmsService {
  private readonly keyId =
    process.env.KMS_KEY_ARN || process.env.KMS_KEY_ID || 'alias/nemory-app';

  constructor(private readonly kms: KMSClient) {}

  async encrypt(
    plaintext: Buffer | string,
    ctx: EncryptionContext = { app: 'nemory' },
  ): Promise<EncryptedBlob> {
    const gd = await this.kms.send(
      new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: 'AES_256',
        EncryptionContext: ctx,
      }),
    );

    if (!gd.Plaintext || !gd.CiphertextBlob) {
      throw new Error('KMS failed to generate data key');
    }

    const dataKey = Buffer.from(gd.Plaintext);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);

    const input = Buffer.isBuffer(plaintext)
      ? plaintext
      : Buffer.from(plaintext, 'utf8');

    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const tag = cipher.getAuthTag();

    dataKey.fill(0);

    return {
      v: 1,
      alg: 'AES-256-GCM',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: encrypted.toString('base64'),
      edk: Buffer.from(gd.CiphertextBlob).toString('base64'),
    };
  }

  async decrypt(
    blob: EncryptedBlob,
    ctx: EncryptionContext = { app: 'nemory' },
  ): Promise<Buffer> {
    const alg = String((blob as { alg?: unknown }).alg);
    if (alg !== 'AES-256-GCM') {
      throw new Error(`Unsupported alg: ${alg}`);
    }

    const dec = await this.kms.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(blob.edk, 'base64'),
        EncryptionContext: ctx,
        KeyId: this.keyId,
      }),
    );

    if (!dec.Plaintext) {
      throw new Error('KMS failed to decrypt data key');
    }

    const dataKey = Buffer.from(dec.Plaintext); // 32 bytes
    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const ciphertext = Buffer.from(blob.ct, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // занулити key
    dataKey.fill(0);

    return plaintext;
  }
}

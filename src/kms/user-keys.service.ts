import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';

const USER_KMS_SCOPE = 'user_dek';

@Injectable()
export class UserKeysService {
  private readonly keyId =
    process.env.KMS_KEY_ARN || process.env.KMS_KEY_ID || 'alias/nemory-app';

  constructor(
    private readonly kms: KMSClient,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private kmsCtx(userId: number, kver: number) {
    return {
      app: 'nemory',
      scope: USER_KMS_SCOPE,
      uid: String(userId),
      kver: String(kver),
    };
  }

  async ensureUserEdk(userId: number): Promise<User> {
    let user = await this.users.findOneByOrFail({ id: userId });

    if (!user.dekEncrypted) {
      const ctx = this.kmsCtx(user.id, user.dekVersion);
      const gd = await this.kms.send(
        new GenerateDataKeyCommand({
          KeyId: this.keyId,
          KeySpec: 'AES_256',
          EncryptionContext: ctx,
        }),
      );
      if (!gd.CiphertextBlob)
        throw new Error('KMS did not return CiphertextBlob for user DEK');

      user.dekEncrypted = Buffer.from(gd.CiphertextBlob);
      user = await this.users.save(user);
    }
    return user;
  }

  async getUserDek(userId: number): Promise<{ dek: Buffer; user: User }> {
    const user = await this.ensureUserEdk(userId);
    const ctx = this.kmsCtx(user.id, user.dekVersion);

    const dec = await this.kms.send(
      new DecryptCommand({
        CiphertextBlob: user.dekEncrypted!,
        EncryptionContext: ctx,
        KeyId: this.keyId,
      }),
    );
    if (!dec.Plaintext) throw new Error('KMS failed to decrypt user DEK');

    const dek = Buffer.from(dec.Plaintext);
    return { dek, user };
  }
}

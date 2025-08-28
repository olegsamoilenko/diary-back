import type { CipherBlobV1 } from '../types';
import type { CryptoService } from '../crypto.service';

export async function decrypt(
  crypto: CryptoService,
  userId: number,
  blob: CipherBlobV1,
): Promise<string> {
  const buf: Buffer = await crypto.decryptForUser(userId, blob);
  return buf.toString('utf8');
}

import { createHash } from 'crypto';

export function generateHash(uuid: string, salt: string): string {
  const hash = createHash('sha256');
  hash.update(uuid + salt);
  return hash.digest('hex');
}

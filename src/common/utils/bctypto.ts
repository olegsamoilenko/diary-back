import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { inspect } from 'util';
import { throwError } from './index';
import { HttpStatus } from './http-status';

const ROUNDS = Math.min(
  Math.max(Number(process.env.REFRESH_BCRYPT_ROUNDS ?? 12), 8),
  14,
);
const PEPPER = process.env.REFRESH_PEPPER ?? '';

function sha256Base64(input: string, pepper = PEPPER): string {
  if (typeof input !== 'string' || input.length === 0) {
    throwError(
      HttpStatus.BAD_REQUEST,
      'sha256Base64',
      'sha256Base64: input is empty',
      'SHA256_INPUT_EMPTY',
    );
  }
  const h = createHash('sha256');
  h.update(input, 'utf8');
  if (pepper) h.update(pepper, 'utf8');
  return h.digest('base64');
}

export function toError(e: unknown): Error {
  if (e instanceof Error) return e;

  let message: string;
  if (typeof e === 'string') {
    message = e;
  } else {
    try {
      message = inspect(e, { depth: 3 });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      message = Object.prototype.toString.call(e);
    }
  }

  return new Error(message);
}

function bcryptHashRaw(data: string, rounds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    bcrypt.hash(data, rounds, (err: unknown, hash?: string) => {
      if (err) return reject(toError(err));
      if (typeof hash !== 'string')
        return reject(new Error('bcrypt returned empty hash'));
      resolve(hash);
    });
  });
}

function bcryptCompareRaw(data: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    bcrypt.compare(data, hash, (err: unknown, same?: boolean) => {
      if (err) return reject(toError(err));
      resolve(Boolean(same));
    });
  });
}

export async function bcryptHashToken(token: string): Promise<string> {
  const pre = sha256Base64(token);
  return bcryptHashRaw(pre, ROUNDS);
}

export async function bcryptVerifyToken(
  token: string,
  hash: string,
): Promise<boolean> {
  const pre = sha256Base64(token);
  return bcryptCompareRaw(pre, hash);
}

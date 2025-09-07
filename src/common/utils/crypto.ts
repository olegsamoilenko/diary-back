import * as crypto from 'crypto';

export function hmacCode(code: string): string {
  const secret = process.env.DELETE_CODE_SECRET ?? 'super-secret';
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

export function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

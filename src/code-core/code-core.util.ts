import * as crypto from 'crypto';
export const genCode = () => crypto.randomInt(100000, 1000000).toString();
export const hmac = (code: string) =>
  crypto
    .createHmac('sha256', process.env.DELETE_CODE_SECRET ?? 'secret')
    .update(code)
    .digest('hex');
export const sha256 = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { POLICIES } from './code-core.security';
import { genCode, hmac, sha256, sleep } from './code-core.util';
import type { Purpose, SendResult, VerifyResult } from './code-core.types';

const PREFIX = 'authcode';
const ATTEMPTS_EXCEEDED_TTL_SEC = 10 * 60;

const ROTATE_LUA = `
-- KEYS[1]=codeKey  KEYS[2]=triesKey KEYS[3]=exceededKey
-- ARGV[1]=newHash  ARGV[2]=tries  ARGV[3]=ttlSec
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
if KEYS[3] and #KEYS[3] > 0 then
  redis.call('DEL', KEYS[3])
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))
return 'OK'
`;

const VERIFY_LUA = `
-- KEYS[1] = codeKey
-- KEYS[2] = triesKey
-- KEYS[3] = exceededKey
-- ARGV[1] = providedHash
-- ARGV[2] = exceededTtlSec

if KEYS[3] and redis.call('EXISTS', KEYS[3]) == 1 then
  return 'ATTEMPTS_EXCEEDED'
end

local code = redis.call('GET', KEYS[1])
if not code then
  return 'EXPIRED'
end

local tries = tonumber(redis.call('GET', KEYS[2]) or '0')
if tries <= 0 then
  redis.call('DEL', KEYS[1]); redis.call('DEL', KEYS[2]);
  if KEYS[3] and #KEYS[3] > 0 and tonumber(ARGV[2] or '0') > 0 then
    redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[2]))
  end
  return 'ATTEMPTS_EXCEEDED'
end

if code == ARGV[1] then
  redis.call('DEL', KEYS[1]); redis.call('DEL', KEYS[2]);
  return 'OK'
else
  tries = redis.call('DECR', KEYS[2])
  if tries <= 0 then
    redis.call('DEL', KEYS[1]); redis.call('DEL', KEYS[2]);
    if KEYS[3] and #KEYS[3] > 0 and tonumber(ARGV[2] or '0') > 0 then
      redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[2]))
    end
    return 'ATTEMPTS_EXCEEDED'
  else
    return 'BAD:' .. tostring(tries)
  end
end
`;

@Injectable()
export class CodeCoreService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private subjectKey(
    purpose: Purpose,
    subject: { email?: string; userId?: number },
  ) {
    const email = (subject.email ?? '').trim().toLowerCase();
    return sha256(email);
  }
  private keys(purpose: Purpose, subj: string) {
    const base = `${PREFIX}:${purpose}:${subj}`;
    return {
      codeKey: `${base}:code`,
      triesKey: `${base}:tries`,
      resendKey: `${base}:resend`,
      exceededKey: `${base}:exceeded`,
    };
  }

  async send(
    purpose: Purpose,
    subject: { email: string },
  ): Promise<SendResult & { code?: string; retryAfterSec?: number }> {
    const policy = POLICIES[purpose];
    const subj = this.subjectKey(purpose, subject);
    const { codeKey, triesKey, resendKey } = this.keys(purpose, subj);

    const ok = await this.redis.set(
      resendKey,
      '1',
      'EX',
      policy.resendCooldownSec,
      'NX',
    );
    if (!ok) {
      const pttl = await this.redis.pttl(resendKey);
      return {
        status: 'COOLDOWN',
        retryAfterSec: Math.max(1, Math.ceil((pttl ?? 0) / 1000)),
      };
    }

    const code = genCode();
    const codeHash = hmac(code);
    await this.redis.eval(
      ROTATE_LUA,
      2,
      codeKey,
      triesKey,
      codeHash,
      String(policy.tries),
      String(policy.ttlSec),
    );

    if (policy.noEnumeration) await sleep(200 + Math.random() * 200);
    return { status: 'SENT', code };
  }

  async verify(
    purpose: Purpose,
    subject: { email: string },
    code: string,
  ): Promise<VerifyResult> {
    const subj = this.subjectKey(purpose, subject);
    const { codeKey, triesKey, exceededKey } = this.keys(purpose, subj);

    const res = await this.redis.eval(
      VERIFY_LUA,
      3,
      codeKey,
      triesKey,
      exceededKey,
      hmac(code),
      String(ATTEMPTS_EXCEEDED_TTL_SEC),
    );

    if (res === 'OK') return { status: 'OK' };
    if (res === 'EXPIRED') return { status: 'EXPIRED_CODE' };
    if (res === 'ATTEMPTS_EXCEEDED') return { status: 'ATTEMPTS_EXCEEDED' };
    if (typeof res === 'string' && String(res).startsWith('BAD:')) {
      const left = Number(String(res).split(':')[1] || '0');
      return { status: 'INVALID_CODE', attemptsLeft: left };
    }
    return { status: 'INVALID_CODE' };
  }
}

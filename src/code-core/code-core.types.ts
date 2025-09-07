export type SendResult =
  | { status: 'SENT' }
  | { status: 'COOLDOWN'; retryAfterSec: number };

export type VerifyResult =
  | { status: 'OK' }
  | { status: 'INVALID_CODE'; attemptsLeft?: number }
  | { status: 'EXPIRED_CODE' }
  | { status: 'ATTEMPTS_EXCEEDED' };

export type Purpose = 'register_email' | 'email_change' | 'password_reset';

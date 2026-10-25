import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { User } from './entities/user.entity';

export const ADMIN_TIMEZONE = 'Europe/Kyiv';
export type RegistrationRange = { from: string; to: string };

export function registrationRange(from: string, to: string): RegistrationRange {
  for (const value of [from, to]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Вкажіть коректні дати від і до.');
    }
  }
  if (from > to)
    throw new BadRequestException('Дата від має бути не пізніше дати до.');
  return { from, to };
}

export function positiveInteger(value: unknown, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new BadRequestException(
      'Сторінка та кількість мають бути додатними цілими числами.',
    );
  }
  return number;
}

// users.createdAt is a PostgreSQL timestamp without time zone, stored in UTC.
// Keep the indexed column bare in predicates and convert inclusive Kyiv dates.
export function filterRegistrations(
  qb: SelectQueryBuilder<User>,
  range: RegistrationRange,
) {
  return qb.andWhere(
    `u.createdAt >= (CAST(:from AS date)::timestamp AT TIME ZONE :zone) AT TIME ZONE 'UTC'
     AND u.createdAt < ((CAST(:to AS date) + 1)::timestamp AT TIME ZONE :zone) AT TIME ZONE 'UTC'`,
    { ...range, zone: ADMIN_TIMEZONE },
  );
}

export const adminPrivateFields = new Set([
  'hash',
  'password',
  'passwordResetCode',
  'passwordChangeToken',
  'emailVerificationCode',
  'phoneVerificationCode',
  'deleteAccountVerificationCode',
  'resetPinVerificationCode',
  'newEmailVerificationCode',
  'dekEncrypted',
  'purchaseToken',
  'linkedPurchaseToken',
  'receipt',
  'receiptData',
]);

export function publicAdminData<T>(value: T): T {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(publicAdminData) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !adminPrivateFields.has(key))
        .map(([key, item]) => [key, publicAdminData(item)]),
    ) as T;
  }
  return value;
}

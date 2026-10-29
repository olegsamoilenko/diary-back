import { BadRequestException } from '@nestjs/common';

// Never pass missing/null tokens to TypeORM: they can remove the WHERE filter.
export function assertPurchaseToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException({
      code: 'INVALID_PURCHASE_TOKEN',
      message: 'purchaseToken must be a non-empty string',
    });
  }
}

import { HasPlan } from '../types';
import { BadRequestException, PipeTransform } from '@nestjs/common';

export class ParseHasPlanPipe
  implements PipeTransform<string | undefined, HasPlan>
{
  transform(value?: string): HasPlan {
    if (!value) return 'All';

    const s = value.trim().toLowerCase();
    if (s === 'all') return 'All';
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;

    throw new BadRequestException(
      `Invalid hasPlan: ${value}. Use true|false|All`,
    );
  }
}

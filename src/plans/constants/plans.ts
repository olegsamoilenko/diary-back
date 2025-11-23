import { BasePlanIds } from '../types';

export const PLANS: Record<
  string,
  {
    name: string;
    tokensLimit: number;
  }
> = {
  'start-d7': {
    name: 'Start',
    tokensLimit: 350000,
  },
  'lite-m1': {
    name: 'Lite',
    tokensLimit: 850000,
  },
  'base-m1': {
    name: 'Base',
    tokensLimit: 1700000,
  },
  'pro-m1': {
    name: 'Pro',
    tokensLimit: 3400000,
  },
};

export const PAID_PLANS: BasePlanIds[] = [
  BasePlanIds.LITE_M1,
  BasePlanIds.BASE_M1,
  BasePlanIds.PRO_M1,
];

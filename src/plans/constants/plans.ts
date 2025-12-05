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
    tokensLimit: 150000,
  },
  'lite-m1': {
    name: 'Lite',
    tokensLimit: 1000000,
  },
  'base-m1': {
    name: 'Base',
    tokensLimit: 2000000,
  },
  'pro-m1': {
    name: 'Pro',
    tokensLimit: 4000000,
  },
};

export const PAID_PLANS: BasePlanIds[] = [
  BasePlanIds.LITE_M1,
  BasePlanIds.BASE_M1,
  BasePlanIds.PRO_M1,
];

import { BasePlanIds } from '../types';

export const PLANS: Record<
  string,
  {
    name: string;
    creditsLimit: number;
  }
> = {
  'start-d7': {
    name: 'Start',
    creditsLimit: 10000,
  },
  'lite-m1': {
    name: 'Lite',
    creditsLimit: 40000,
  },
  'base-m1': {
    name: 'Base',
    creditsLimit: 80000,
  },
  'pro-m1': {
    name: 'Pro',
    creditsLimit: 160000,
  },
};

export const PAID_PLANS: BasePlanIds[] = [
  BasePlanIds.LITE_M1,
  BasePlanIds.BASE_M1,
  BasePlanIds.PRO_M1,
];

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
    creditsLimit: 5000,
  },
  'lite-m1': {
    name: 'Lite',
    creditsLimit: 30000,
  },
  'base-m1': {
    name: 'Base',
    creditsLimit: 60000,
  },
  'pro-m1': {
    name: 'Pro',
    creditsLimit: 120000,
  },
};

export const PAID_PLANS: BasePlanIds[] = [
  BasePlanIds.LITE_M1,
  BasePlanIds.BASE_M1,
  BasePlanIds.PRO_M1,
];

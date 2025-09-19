import { PlanTypes } from '../types';

type PlanDurationType = 'day' | 'month' | 'year';

export const PLANS: Record<
  string,
  {
    name: string;
    tokensLimit: number;
  }
> = {
  nemory_for_testing: {
    name: 'For testing',
    tokensLimit: 800000,
  },
  nemory_start: {
    name: 'Start',
    tokensLimit: 350000,
  },
  nemory_lite: {
    name: 'Lite',
    tokensLimit: 850000,
  },
  nemory_base: {
    name: 'Base',
    tokensLimit: 1700000,
  },
  nemory_pro: {
    name: 'Pro',
    tokensLimit: 3400000,
  },
};

export const PlanType: PlanTypes = PlanTypes.INTERNAL_TESTING;

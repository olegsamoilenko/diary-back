import { PlanTypes } from '../types';

type PlanDurationType = 'day' | 'month' | 'year';

export const PLANS: Record<
  string,
  {
    name: string;
    price: number;
    tokensLimit: number;
    duration: number;
    durationType: PlanDurationType;
  }
> = {
  'For testing': {
    name: 'For testing',
    price: 0,
    tokensLimit: 800000,
    duration: 7,
    durationType: 'day',
  },
  Start: {
    name: 'Start',
    price: 0,
    tokensLimit: 350000,
    duration: 7,
    durationType: 'day',
  },
  Lite: {
    name: 'Lite',
    price: 10,
    tokensLimit: 850000,
    duration: 1,
    durationType: 'month',
  },
  Base: {
    name: 'Base',
    price: 20,
    tokensLimit: 1700000,
    duration: 1,
    durationType: 'month',
  },
  Pro: {
    name: 'Pro',
    price: 40,
    tokensLimit: 3400000,
    duration: 1,
    durationType: 'month',
  },
};

export const PlanType: PlanTypes = PlanTypes.INTERNAL_TESTING;

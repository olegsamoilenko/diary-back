export enum Plans {
  FOR_TESTING = 'For testing',
  START = 'Start',
  LITE = 'Lite',
  BASE = 'Base',
  PRO = 'Pro',
}

export enum PlanIds {
  FOR_TESTING = 'memory_for_testing',
  START = 'memory_start',
  LITE = 'memory_lite',
  BASE = 'memory_base',
  PRO = 'memory_pro',
}

export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
  IN_GRACE = 'IN_GRACE',
  ON_HOLD = 'ON_HOLD',
  PAUSED = 'PAUSED',
  RESTARTED = 'RESTARTED',
  REFUNDED = 'REFUNDED',
}

export enum PlanTypes {
  INTERNAL_TESTING = 'internal_testing',
  CLOSED_TESTING = 'closed_testing',
  OPEN_TESTING = 'open_testing',
  PRODUCTION = 'production',
}

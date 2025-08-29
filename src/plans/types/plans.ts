export enum Plans {
  START = 'Start',
  LITE = 'Lite',
  BASE = 'Base',
  PRO = 'Pro',
}

export enum PlanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CANCELED = 'canceled',
  EXPIRED = 'expired',
  IN_GRACE_PERIOD = 'in_grace_period',
  ON_HOLD = 'on_hold',
  PAUSED = 'paused',
  RESTARTED = 'restarted',
  REFUNDED = 'refunded',
}

export enum PlanTypes {
  INTERNAL_TESTING = 'internal_testing',
  CLOSED_TESTING = 'closed_testing',
  OPEN_TESTING = 'open_testing',
  PRODUCTION = 'production',
}

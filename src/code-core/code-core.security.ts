export const POLICIES = {
  register_email: {
    ttlSec: 15 * 60,
    tries: 5,
    resendCooldownSec: 60,
    noEnumeration: true,
  },
  email_change: {
    ttlSec: 15 * 60,
    tries: 5,
    resendCooldownSec: 60,
    noEnumeration: false,
  },
  reset_pin: {
    ttlSec: 15 * 60,
    tries: 5,
    resendCooldownSec: 60,
    noEnumeration: false,
  },
  password_reset: {
    ttlSec: 50 * 60,
    tries: 5,
    resendCooldownSec: 60,
    noEnumeration: true,
  },
  delete_account: {
    ttlSec: 15 * 60,
    tries: 5,
    resendCooldownSec: 60,
    noEnumeration: true,
  },
} as const;
export type PolicyMap = typeof POLICIES;

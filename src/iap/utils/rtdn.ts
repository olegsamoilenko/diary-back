import {
  RtdnPayload,
  RtdnSubscriptionNotification,
} from '../types/subscription';

export function decodeBase64Json<T>(b64: string): T | null {
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function hasSubscriptionNotification(
  p: RtdnPayload | null,
): p is RtdnPayload & {
  subscriptionNotification: RtdnSubscriptionNotification;
} {
  return !!p?.subscriptionNotification;
}

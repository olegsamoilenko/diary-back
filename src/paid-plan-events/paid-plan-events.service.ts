import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import {
  PaidPlanEvent,
  PaidPlanEventSeverity,
  PaidPlanEventSource,
} from './entities/paid-plan-event.entity';
import { sendPlansTelegram } from 'src/telegram/send-telegram';

type PaidPlanEventPayload = Partial<
  Omit<
    PaidPlanEvent,
    | 'id'
    | 'createdAt'
    | 'severity'
    | 'eventType'
    | 'source'
    | 'purchaseTokenHash'
    | 'purchaseTokenSuffix'
    | 'linkedPurchaseTokenHash'
    | 'linkedPurchaseTokenSuffix'
  >
> & {
  eventType: string;
  source: PaidPlanEventSource;
  purchaseToken?: string | null;
  linkedPurchaseToken?: string | null;
};

@Injectable()
export class PaidPlanEventsService {
  constructor(
    @InjectRepository(PaidPlanEvent)
    private readonly paidPlanEventRepository: Repository<PaidPlanEvent>,
  ) {}

  async info(payload: PaidPlanEventPayload): Promise<void> {
    await this.record(PaidPlanEventSeverity.INFO, payload);
  }

  async warning(payload: PaidPlanEventPayload): Promise<void> {
    await this.record(PaidPlanEventSeverity.WARNING, payload);
  }

  async conflict(payload: PaidPlanEventPayload): Promise<void> {
    await this.record(PaidPlanEventSeverity.CONFLICT, payload);
  }

  private async record(
    severity: PaidPlanEventSeverity,
    payload: PaidPlanEventPayload,
  ): Promise<void> {
    try {
      const event = this.paidPlanEventRepository.create({
        ...payload,
        severity,
        purchaseTokenHash: this.hashToken(payload.purchaseToken),
        purchaseTokenSuffix: this.tokenSuffix(payload.purchaseToken),
        linkedPurchaseTokenHash: this.hashToken(payload.linkedPurchaseToken),
        linkedPurchaseTokenSuffix: this.tokenSuffix(
          payload.linkedPurchaseToken,
        ),
      });

      delete (event as { purchaseToken?: string }).purchaseToken;
      delete (event as { linkedPurchaseToken?: string }).linkedPurchaseToken;

      await this.paidPlanEventRepository.save(event);

      if (severity !== PaidPlanEventSeverity.INFO) {
        await this.sendTelegramAlert(severity, event);
      }
    } catch (error) {
      console.error('Failed to record paid plan event:', error);
    }
  }

  private hashToken(token?: string | null): string | null {
    if (!token) {
      return null;
    }

    return createHash('sha256').update(token).digest('hex');
  }

  private tokenSuffix(token?: string | null): string | null {
    if (!token) {
      return null;
    }

    return token.slice(-10);
  }

  private async sendTelegramAlert(
    severity: PaidPlanEventSeverity,
    event: PaidPlanEvent,
  ): Promise<void> {
    try {
      const icon =
        severity === PaidPlanEventSeverity.CONFLICT ? '[CONFLICT]' : '[WARN]';

      const lines = [
        `${icon} PAID PLAN ${severity}`,
        event.id ? `eventId: ${event.id}` : null,
        `event: ${event.eventType}`,
        `source: ${event.source}`,
        event.userId ? `userId: ${event.userId}` : null,
        event.planId ? `planId: ${event.planId}` : null,
        event.oldPlanId ? `oldPlanId: ${event.oldPlanId}` : null,
        event.newPlanId ? `newPlanId: ${event.newPlanId}` : null,
        event.basePlanId ? `basePlanId: ${event.basePlanId}` : null,
        event.oldBasePlanId ? `oldBasePlanId: ${event.oldBasePlanId}` : null,
        event.planStatus ? `status: ${event.planStatus}` : null,
        event.oldPlanStatus ? `oldStatus: ${event.oldPlanStatus}` : null,
        event.expiryTime ? `expiry: ${event.expiryTime}` : null,
        event.oldExpiryTime ? `oldExpiry: ${event.oldExpiryTime}` : null,
        event.orderId ? `orderId: ${event.orderId}` : null,
        event.oldOrderId ? `oldOrderId: ${event.oldOrderId}` : null,
        event.purchaseTokenSuffix
          ? `tokenSuffix: ${event.purchaseTokenSuffix}`
          : null,
        event.linkedPurchaseTokenSuffix
          ? `linkedTokenSuffix: ${event.linkedPurchaseTokenSuffix}`
          : null,
        event.googleSubscriptionState
          ? `googleState: ${event.googleSubscriptionState}`
          : null,
        event.googleExpiryTime ? `googleExpiry: ${event.googleExpiryTime}` : null,
        event.googleOrderId ? `googleOrderId: ${event.googleOrderId}` : null,
        event.message ? `message: ${event.message}` : null,
      ].filter(Boolean);

      await sendPlansTelegram(lines.join('\n'));
    } catch (error) {
      console.warn('Failed to send paid plan Telegram alert:', error);
    }
  }
}

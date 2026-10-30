import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { IapController } from './iap.controller';
import { Logger, ServiceUnavailableException } from '@nestjs/common';

describe('IapController', () => {
  const iapService = {
    createAndroidSub: jest.fn(),
    pubSubAndroid: jest.fn(),
  };
  const subscriptionsService = {
    handleGooglePlayPubSub: jest.fn(),
  };
  const creditPurchasesService = {
    handleGooglePlayRtdn: jest.fn(),
    handleVoidedGooglePlayPurchase: jest.fn(),
  };

  let controller: IapController;
  let consoleDirSpy: jest.SpiedFunction<typeof console.dir>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleDirSpy = jest.spyOn(console, 'dir').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
    );
  });

  afterEach(() => {
    consoleDirSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function encodePayload(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  it('routes Android create-sub requests to IapService with the active user id', async () => {
    (iapService.createAndroidSub as any).mockResolvedValueOnce({ id: 59 });

    const result = await controller.createSub({ id: 167 } as any, {
      platform: 'android',
      packageName: 'app.package',
      productId: 'nemory',
      purchaseToken: 'purchase-token',
    });

    expect(result).toEqual({ id: 59 });
    expect(iapService.createAndroidSub).toHaveBeenCalledWith(
      167,
      'app.package',
      'purchase-token',
    );
  });

  it('returns ok and ignores Pub/Sub messages without data', async () => {
    const result = await controller.handle({
      message: { data: undefined },
    } as any);

    expect(result).toBe('ok');
    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
    expect(subscriptionsService.handleGooglePlayPubSub).not.toHaveBeenCalled();
  });

  it('returns ok and ignores Pub/Sub test notifications', async () => {
    const result = await controller.handle({
      message: {
        messageId: 'm1',
        publishTime: '2026-06-25T15:00:00.000Z',
        data: encodePayload({
          version: '1.0',
          packageName: 'app.package',
          testNotification: {},
        }),
      },
    });

    expect(result).toBe('ok');
    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
    expect(subscriptionsService.handleGooglePlayPubSub).not.toHaveBeenCalled();
  });

  it('routes subscription Pub/Sub notifications to legacy and new handlers', async () => {
    (iapService.pubSubAndroid as any).mockResolvedValueOnce(true);
    (subscriptionsService.handleGooglePlayPubSub as any).mockResolvedValueOnce({
      handled: true,
    });

    const result = await controller.handle({
      message: {
        messageId: 'm1',
        publishTime: '2026-06-25T15:00:00.000Z',
        data: encodePayload({
          version: '1.0',
          packageName: 'app.package',
          subscriptionNotification: {
            version: '1.0',
            notificationType: 2,
            purchaseToken: 'purchase-token',
            subscriptionId: 'nemory',
          },
        }),
      },
    });

    expect(result).toBe('ok');
    expect(iapService.pubSubAndroid).toHaveBeenCalledWith(
      'app.package',
      'purchase-token',
      2,
    );
    expect(subscriptionsService.handleGooglePlayPubSub).toHaveBeenCalledWith(
      'app.package',
      'purchase-token',
      2,
    );
  });

  it('requests redelivery when V2 fails after legacy succeeds', async () => {
    (iapService.pubSubAndroid as any).mockResolvedValueOnce(true);
    (subscriptionsService.handleGooglePlayPubSub as any).mockRejectedValueOnce(
      new Error('new handler failed'),
    );

    const result = controller.handle({
      message: {
        messageId: 'm1',
        publishTime: '2026-06-25T15:00:00.000Z',
        data: encodePayload({
          version: '1.0',
          packageName: 'app.package',
          subscriptionNotification: {
            version: '1.0',
            notificationType: 2,
            purchaseToken: 'purchase-token',
            subscriptionId: 'nemory',
          },
        }),
      },
    });

    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(iapService.pubSubAndroid).toHaveBeenCalled();
    expect(subscriptionsService.handleGooglePlayPubSub).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('does not route malformed Pub/Sub base64 payloads', async () => {
    const result = await controller.handle({
      message: {
        messageId: 'm1',
        publishTime: '2026-06-25T15:00:00.000Z',
        data: 'not-valid-json',
      },
    });

    expect(result).toBe('ok');
    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
    expect(subscriptionsService.handleGooglePlayPubSub).not.toHaveBeenCalled();
  });

  it.each(['legacy', 'v2', 'both', 'empty rejection'])(
    'NA-13 retries %s failure without acknowledging it or logging tokens',
    async (failure) => {
      const envelope = {
        message: {
          messageId: 'na13-retry',
          publishTime: '2026-10-29T12:00:00Z',
          data: encodePayload({
            packageName: 'app.package',
            subscriptionNotification: {
              purchaseToken: 'private-token-na13',
              notificationType: 2,
            },
          }),
        },
      };
      const error = new Error('Provider URL private-token-na13');
      if (failure === 'legacy' || failure === 'both')
        (iapService.pubSubAndroid as any).mockRejectedValueOnce(error);
      if (failure !== 'legacy')
        (
          subscriptionsService.handleGooglePlayPubSub as any
        ).mockRejectedValueOnce(
          failure === 'empty rejection' ? undefined : error,
        );
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});
      const errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      try {
        await expect(controller.handle(envelope)).rejects.toMatchObject({
          status: 503,
        });
        expect(iapService.pubSubAndroid).toHaveBeenCalledTimes(1);
        expect(
          subscriptionsService.handleGooglePlayPubSub,
        ).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(log.mock.calls)).not.toContain('acknowledged');
        expect(JSON.stringify(errorLog.mock.calls)).toContain('retry required');
        expect(
          JSON.stringify([...log.mock.calls, ...errorLog.mock.calls]),
        ).not.toContain('private-token-na13');
        await expect(controller.handle(envelope)).resolves.toBe('ok');
        expect(iapService.pubSubAndroid).toHaveBeenCalledTimes(2);
        expect(
          subscriptionsService.handleGooglePlayPubSub,
        ).toHaveBeenCalledTimes(2);
      } finally {
        log.mockRestore();
        errorLog.mockRestore();
      }
    },
  );

  it('routes one-time product Pub/Sub notifications to the credit handler', async () => {
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
      creditPurchasesService as any,
    );

    await controller.handle({
      message: {
        messageId: 'm-credit',
        publishTime: '2026-08-25T08:00:00.000Z',
        data: encodePayload({
          packageName: 'com.soniac12.nemory',
          oneTimeProductNotification: {
            notificationType: 1,
            purchaseToken: 'credit-token',
            sku: 'nemory_credits_5000',
          },
        }),
      },
    });

    expect(creditPurchasesService.handleGooglePlayRtdn).toHaveBeenCalledWith(
      'com.soniac12.nemory',
      'credit-token',
      'nemory_credits_5000',
      1,
    );
  });

  it('revokes one-time credits for a voided purchase notification', async () => {
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
      creditPurchasesService as any,
    );

    await controller.handle({
      message: {
        messageId: 'm-refund',
        publishTime: '2026-08-25T08:00:00.000Z',
        data: encodePayload({
          packageName: 'com.soniac12.nemory',
          voidedPurchaseNotification: {
            purchaseToken: 'credit-token',
            orderId: 'GPA.1',
            productType: 2,
            refundType: 1,
          },
        }),
      },
    });

    expect(
      creditPurchasesService.handleVoidedGooglePlayPurchase,
    ).toHaveBeenCalledWith('credit-token', 'GPA.1');
  });

  const refundEnvelope = () => ({
    message: {
      messageId: 'refund-message',
      publishTime: '2026-10-28T20:11:13.000Z',
      data: encodePayload({
        packageName: 'com.soniac12.nemory',
        voidedPurchaseNotification: {
          purchaseToken: 'secret-purchase-token',
          orderId: 'GPA.test',
          productType: 2,
          refundType: 1,
        },
      }),
    },
  });

  it('returns 503 on refund processing failure so Pub/Sub can redeliver', async () => {
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
      creditPurchasesService as any,
    );
    (
      creditPurchasesService.handleVoidedGooglePlayPurchase as any
    ).mockRejectedValueOnce(
      new Error('Google URL contains secret-purchase-token'),
    );
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      await expect(controller.handle(refundEnvelope())).rejects.toMatchObject({
        status: 503,
        message: 'IAP notification processing failed',
      });
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('refund-message'),
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
        'secret-purchase-token',
      );
      (
        creditPurchasesService.handleVoidedGooglePlayPurchase as any
      ).mockResolvedValueOnce({ handled: true });
      await expect(controller.handle(refundEnvelope())).resolves.toBe('ok');
    } finally {
      errorLog.mockRestore();
    }
  });

  it('does not acknowledge a refund when its purchase exists but wallet is missing', async () => {
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
      creditPurchasesService as any,
    );
    (
      creditPurchasesService.handleVoidedGooglePlayPurchase as any
    ).mockResolvedValueOnce({
      handled: false,
      reason: 'CREDIT_WALLET_NOT_FOUND',
    });
    await expect(controller.handle(refundEnvelope())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('logs duplicate refund acknowledgement without tokens or the encoded payload', async () => {
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
      creditPurchasesService as any,
    );
    (
      creditPurchasesService.handleVoidedGooglePlayPurchase as any
    ).mockResolvedValueOnce({
      handled: true,
      alreadyRevoked: true,
    });
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});
    try {
      const envelope = refundEnvelope();
      await expect(controller.handle(envelope)).resolves.toBe('ok');
      const messages = JSON.stringify(log.mock.calls);
      expect(messages).toContain('credit-result');
      expect(messages).toContain('alreadyRevoked');
      expect(messages).toContain('acknowledged');
      expect(messages).not.toContain('secret-purchase-token');
      expect(messages).not.toContain(envelope.message.data);
    } finally {
      log.mockRestore();
    }
  });

  it('makes an unmatched purchase visible instead of logging it as a successful credit refund', async () => {
    controller = new IapController(
      iapService as any,
      subscriptionsService as any,
      creditPurchasesService as any,
    );
    (
      creditPurchasesService.handleVoidedGooglePlayPurchase as any
    ).mockResolvedValueOnce({
      handled: false,
      reason: 'CREDIT_PURCHASE_NOT_FOUND',
    });
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      await expect(controller.handle(refundEnvelope())).resolves.toBe('ok');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('CREDIT_PURCHASE_NOT_FOUND'),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

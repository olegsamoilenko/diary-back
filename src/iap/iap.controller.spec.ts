import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { IapController } from './iap.controller';

describe('IapController', () => {
  const iapService = {
    createAndroidSub: jest.fn(),
    pubSubAndroid: jest.fn(),
  };

  let controller: IapController;
  let consoleDirSpy: jest.SpiedFunction<typeof console.dir>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleDirSpy = jest.spyOn(console, 'dir').mockImplementation(() => {});
    controller = new IapController(iapService as any);
  });

  afterEach(() => {
    consoleDirSpy.mockRestore();
  });

  function encodePayload(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  it('routes Android create-sub requests to IapService with the active user id', async () => {
    (iapService.createAndroidSub as any).mockResolvedValueOnce({ id: 59 });

    const result = await controller.createSub(
      { id: 167 } as any,
      {
        platform: 'android',
        packageName: 'app.package',
        productId: 'nemory',
        purchaseToken: 'purchase-token',
      },
    );

    expect(result).toEqual({ id: 59 });
    expect(iapService.createAndroidSub).toHaveBeenCalledWith(
      167,
      'app.package',
      'purchase-token',
    );
  });

  it('returns ok and ignores Pub/Sub messages without data', async () => {
    const result = await controller.handle({ message: { data: undefined } } as any);

    expect(result).toBe('ok');
    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
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
  });

  it('routes subscription Pub/Sub notifications to IapService', async () => {
    (iapService.pubSubAndroid as any).mockResolvedValueOnce(true);

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
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { IapController } from '../src/iap/iap.controller';
import { IapService } from '../src/iap/iap.service';

describe('IAP Pub/Sub endpoint (e2e)', () => {
  let app: INestApplication;
  let consoleDirSpy: jest.SpiedFunction<typeof console.dir>;
  const iapService = {
    pubSubAndroid: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    consoleDirSpy = jest.spyOn(console, 'dir').mockImplementation(() => {});

    const moduleRef = await Test.createTestingModule({
      controllers: [IapController],
      providers: [{ provide: IapService, useValue: iapService }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    consoleDirSpy.mockRestore();
    await app.close();
  });

  function encodePayload(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  it('returns ok and ignores empty Pub/Sub messages', async () => {
    await request(app.getHttpServer())
      .post('/iap/pub-sub')
      .send({ message: {} })
      .expect(200)
      .expect('ok');

    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
  });

  it('returns ok and ignores Google test notifications', async () => {
    await request(app.getHttpServer())
      .post('/iap/pub-sub')
      .send({
        message: {
          messageId: 'm1',
          publishTime: '2026-06-25T15:00:00.000Z',
          data: encodePayload({
            version: '1.0',
            packageName: 'app.package',
            testNotification: {},
          }),
        },
      })
      .expect(200)
      .expect('ok');

    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
  });

  it('routes subscription notifications to IapService.pubSubAndroid', async () => {
    await request(app.getHttpServer())
      .post('/iap/pub-sub')
      .send({
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
      })
      .expect(200)
      .expect('ok');

    expect(iapService.pubSubAndroid).toHaveBeenCalledWith(
      'app.package',
      'purchase-token',
      2,
    );
  });

  it('returns ok and ignores malformed Pub/Sub payloads', async () => {
    await request(app.getHttpServer())
      .post('/iap/pub-sub')
      .send({
        message: {
          messageId: 'm1',
          publishTime: '2026-06-25T15:00:00.000Z',
          data: 'not-valid-json',
        },
      })
      .expect(200)
      .expect('ok');

    expect(iapService.pubSubAndroid).not.toHaveBeenCalled();
  });
});

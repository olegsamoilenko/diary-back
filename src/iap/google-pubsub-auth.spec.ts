import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import request from 'supertest';
import { IapController } from './iap.controller';
import { IapService } from './iap.service';
import { GooglePubSubAuthGuard } from './google-pubsub-auth.guard';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreditPurchasesService } from '../credits/credit-purchases.service';
import { CreditPurchase } from '../credits/entities/credit-purchase.entity';
import { CreditWallet } from '../credits/entities/credit-wallet.entity';
import { CreditLedgerEntry } from '../credits/entities/credit-ledger-entry.entity';
import { CreditPurchaseStatus } from '../credits/types';

jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

// Real HTTP guard, Google JWT verifier and refund method. Only Google's public
// certificate download and persistence are replaced; no network/real purchases.
describe('NA-12 authenticated Google Pub/Sub boundary', () => {
  const audience = 'https://nemoryai.com/api/iap/pub-sub';
  const email = 'push@test-project.iam.gserviceaccount.com';
  const packageName = 'com.soniac12.nemory';
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config: Record<string, string> = {};
  const iap = { pubSubAndroid: jest.fn(async () => true) };
  const subscriptions = { handleGooglePlayPubSub: jest.fn(async () => ({})) };
  const oneTime = jest.fn(async () => ({ handled: true }));
  let app: INestApplication;
  let certs: jest.SpiedFunction<OAuth2Client['getFederatedSignonCertsAsync']>;
  let purchase: Record<string, any>;
  let wallet: Record<string, any>;
  let ledger: unknown[];
  let failTransaction = false;
  const manager = {
    findOne: jest.fn(async (entity: unknown, options: any) => {
      if (entity === CreditPurchase)
        return options.where.purchaseToken === 'test-purchase-token'
          ? purchase
          : null;
      if (entity === CreditWallet) return wallet;
      return null;
    }),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn(async (entity: unknown, value: unknown) => {
      if (entity === CreditLedgerEntry) ledger.push(value);
      return value;
    }),
  };
  const transaction = jest.fn(async (work: (m: typeof manager) => unknown) => {
    if (failTransaction) throw new Error('synthetic database unavailable');
    return work(manager);
  });
  const credits = Object.assign(
    Object.create(CreditPurchasesService.prototype),
    {
      dataSource: { transaction },
      creditWalletService: { toSummary: (value: unknown) => value },
      handleGooglePlayRtdn: oneTime,
    },
  );

  function token(
    overrides: Record<string, unknown> = {},
    privateKey = key.privateKey,
  ) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: audience,
        sub: 'synthetic-service-account-id',
        email,
        email_verified: true,
        iat: now - 10,
        exp: now + 3600,
        ...overrides,
      }),
    ).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
  }

  function envelope(
    kind = 'voidedPurchaseNotification',
    pkg: string | null = packageName,
  ) {
    return {
      message: {
        messageId: 'test-message',
        data: Buffer.from(
          JSON.stringify({
            packageName: pkg,
            [kind]:
              kind === 'testNotification'
                ? { version: '1.0' }
                : {
                    purchaseToken: 'test-purchase-token',
                    orderId: 'GPA.synthetic',
                    productType: 2,
                    refundType: 1,
                    notificationType: 1,
                    sku: 'nemory_credits_5000',
                  },
          }),
        ).toString('base64'),
      },
    };
  }

  function post(body = envelope(), jwt = token()) {
    return request(app.getHttpServer())
      .post('/iap/pub-sub')
      .set('Authorization', `Bearer ${jwt}`)
      .send(body);
  }

  function expectNoDispatch() {
    expect(transaction).not.toHaveBeenCalled();
    expect(iap.pubSubAndroid).not.toHaveBeenCalled();
    expect(subscriptions.handleGooglePlayPubSub).not.toHaveBeenCalled();
    expect(oneTime).not.toHaveBeenCalled();
    expect(wallet.balance).toBe(5000);
    expect(ledger).toHaveLength(0);
  }

  beforeAll(async () => {
    certs = jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync');
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const module = await Test.createTestingModule({
      controllers: [IapController],
      providers: [
        GooglePubSubAuthGuard,
        {
          provide: ConfigService,
          useValue: { get: (name: string) => config[name] },
        },
        { provide: IapService, useValue: iap },
        { provide: SubscriptionsService, useValue: subscriptions },
        { provide: CreditPurchasesService, useValue: credits },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    certs.mockResolvedValue({
      certs: {
        'test-key': key.publicKey.export({ type: 'spki', format: 'pem' }),
      },
      format: 'PEM',
    } as any);
    config.GOOGLE_PUBSUB_AUDIENCE = audience;
    config.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL = email;
    config.GOOGLE_PLAY_PACKAGE_NAME = packageName;
    purchase = {
      id: 1,
      userId: 7,
      creditsGranted: 5000,
      creditsRevoked: 0,
      status: CreditPurchaseStatus.CONSUMED,
    };
    wallet = { id: 2, userId: 7, balance: 5000, totalRevoked: 0 };
    ledger = [];
    failTransaction = false;
  });

  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it.each([undefined, 'Basic credentials', 'Bearer', 'Bearer one two'])(
    'rejects missing/malformed authorization %s before processing',
    async (authorization) => {
      const req = request(app.getHttpServer()).post('/iap/pub-sub');
      if (authorization) req.set('Authorization', authorization);
      await req.send(envelope()).expect(401);
      expect(certs).not.toHaveBeenCalled();
      expectNoDispatch();
    },
  );

  it.each([
    ['wrong audience', { aud: 'https://another-endpoint.test' }],
    ['wrong issuer', { iss: 'https://attacker.test' }],
    ['expired', { iat: 1, exp: 2 }],
    ['future issuance', { iat: Math.floor(Date.now() / 1000) + 3600 }],
    ['wrong account', { email: 'another@test.iam.gserviceaccount.com' }],
    ['unverified email', { email_verified: false }],
    ['string instead of verified boolean', { email_verified: 'true' }],
    ['missing email', { email: undefined }],
    ['missing expiry', { exp: undefined }],
  ])('rejects a signed token with %s', async (_name, overrides) => {
    await post(envelope(), token(overrides as Record<string, unknown>)).expect(
      401,
    );
    expectNoDispatch();
  });

  it.each(['wrong-signature', 'malformed', 'unsigned'])(
    'rejects %s JWT without leaking it',
    async (kind) => {
      const jwt =
        kind === 'wrong-signature'
          ? token({}, otherKey.privateKey)
          : kind === 'unsigned'
            ? token().split('.').slice(0, 2).join('.') + '.'
            : 'not-a-jwt';
      const response = await post(envelope(), jwt).expect(401);
      expect(JSON.stringify(response.body)).not.toContain(jwt);
      expectNoDispatch();
    },
  );

  it.each(['GOOGLE_PUBSUB_AUDIENCE', 'GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL'])(
    'fails closed with missing %s',
    async (name) => {
      config[name] = ' ';
      await post().expect(503);
      expectNoDispatch();
    },
  );

  it.each([
    'voidedPurchaseNotification',
    'oneTimeProductNotification',
    'subscriptionNotification',
    'testNotification',
  ])(
    'rejects another package for %s even with valid identity',
    async (kind) => {
      await post(envelope(kind, 'wrong.package')).expect(400);
      expectNoDispatch();
    },
  );

  it('rejects missing package and malformed payload', async () => {
    await post(envelope('voidedPurchaseNotification', null)).expect(400);
    const body = envelope();
    body.message.data = 'not-json';
    await post(body).expect(400);
    expectNoDispatch();
  });

  it('accepts authenticated test notification with custom audience different from endpoint', async () => {
    await post(envelope('testNotification')).expect(200, 'ok');
    expectNoDispatch();
  });

  it('preserves subscription and one-time dispatch after authentication', async () => {
    await post(envelope('subscriptionNotification')).expect(200, 'ok');
    expect(iap.pubSubAndroid).toHaveBeenCalledWith(
      packageName,
      'test-purchase-token',
      1,
    );
    expect(subscriptions.handleGooglePlayPubSub).toHaveBeenCalledWith(
      packageName,
      'test-purchase-token',
      1,
    );
    await post(envelope('oneTimeProductNotification')).expect(200, 'ok');
    expect(oneTime).toHaveBeenCalledWith(
      packageName,
      'test-purchase-token',
      'nemory_credits_5000',
      1,
    );
  });

  it('authenticated duplicate refund revokes exactly once through the real service', async () => {
    await post().expect(200, 'ok');
    await post().expect(200, 'ok');
    expect(wallet.balance).toBe(0);
    expect(wallet.totalRevoked).toBe(5000);
    expect(purchase.creditsRevoked).toBe(5000);
    expect(purchase.status).toBe(CreditPurchaseStatus.REFUNDED);
    expect(ledger).toHaveLength(1);
  });

  it('allows authenticated refund redelivery after a storage failure', async () => {
    failTransaction = true;
    await post().expect(503);
    expect(wallet.balance).toBe(5000);
    failTransaction = false;
    await post().expect(200, 'ok');
    expect(wallet.balance).toBe(0);
    expect(ledger).toHaveLength(1);
  });

  it('does not process when public key retrieval fails and accepts a later redelivery', async () => {
    certs.mockRejectedValueOnce(
      new Error('synthetic certificate endpoint outage'),
    );
    await post().expect(401);
    expectNoDispatch();
    await post().expect(200, 'ok');
    expect(ledger).toHaveLength(1);
  });
});

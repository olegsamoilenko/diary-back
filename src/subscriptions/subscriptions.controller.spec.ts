import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscribeGooglePlayDto } from './dto/subscribe-google-play.dto';

describe('SubscriptionsController', () => {
  const subscriptionsService = {
    getCurrentUserSubscription: jest.fn(),
    bootstrap: jest.fn(),
    ensureInitialState: jest.fn(),
    startTrial: jest.fn(),
    useWithoutSubscription: jest.fn(),
    subscribeGooglePlay: jest.fn(),
  };
  const legacyDryRunService = {
    previewAllUsers: jest.fn(),
  };
  const migrationService = {
    migrateAllUsers: jest.fn(),
  };

  let controller: SubscriptionsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SubscriptionsController(
      subscriptionsService as any,
      legacyDryRunService as any,
      migrationService as any,
    );
  });

  it('routes current user subscription reads to the subscriptions service', async () => {
    (subscriptionsService.getCurrentUserSubscription as any).mockResolvedValueOnce(
      {
        subscription: { userId: 167 },
      },
    );

    const result = await controller.getCurrentUserSubscription({
      id: 167,
    } as any);

    expect(result).toEqual({ subscription: { userId: 167 } });
    expect(subscriptionsService.getCurrentUserSubscription).toHaveBeenCalledWith(
      167,
    );
  });

  it('routes trial starts to the subscriptions service', async () => {
    (subscriptionsService.startTrial as any).mockResolvedValueOnce({
      subscription: { userId: 167, basePlanId: 'start-d7' },
    });

    const result = await controller.startTrial({ id: 167 } as any);

    expect(result).toEqual({
      subscription: { userId: 167, basePlanId: 'start-d7' },
    });
    expect(subscriptionsService.startTrial).toHaveBeenCalledWith(167);
  });

  it('routes bootstrap to the subscriptions service', async () => {
    const dto = { appBuild: 227, appVersion: '2.2.7' };
    (subscriptionsService.bootstrap as any).mockResolvedValueOnce({
      subscription: { userId: 167 },
      activated: true,
    });

    const result = await controller.bootstrap({ id: 167 } as any, dto);

    expect(result).toEqual({
      subscription: { userId: 167 },
      activated: true,
    });
    expect(subscriptionsService.bootstrap).toHaveBeenCalledWith(167, dto);
  });

  it('routes initial state ensure to the subscriptions service', async () => {
    (subscriptionsService.ensureInitialState as any).mockResolvedValueOnce({
      subscription: { userId: 167, basePlanId: 'start-d7' },
      created: true,
    });

    const result = await controller.ensureInitialState({ id: 167 } as any);

    expect(result).toEqual({
      subscription: { userId: 167, basePlanId: 'start-d7' },
      created: true,
    });
    expect(subscriptionsService.ensureInitialState).toHaveBeenCalledWith(
      167,
      {},
    );
  });

  it('routes use-without-subscription to the subscriptions service', async () => {
    (subscriptionsService.useWithoutSubscription as any).mockResolvedValueOnce({
      subscription: { userId: 167, useWithoutSubscription: true },
    });

    const result = await controller.useWithoutSubscription({ id: 167 } as any);

    expect(result).toEqual({
      subscription: { userId: 167, useWithoutSubscription: true },
    });
    expect(subscriptionsService.useWithoutSubscription).toHaveBeenCalledWith(
      167,
    );
  });

  it('routes Google Play subscription creation to the subscriptions service', async () => {
    const dto = {
      packageName: 'app.package',
      purchaseToken: 'purchase-token',
    };
    (subscriptionsService.subscribeGooglePlay as any).mockResolvedValueOnce({
      subscription: { userId: 167, basePlanId: 'lite-m1' },
    });

    const result = await controller.subscribeGooglePlay({ id: 167 } as any, dto);

    expect(result).toEqual({
      subscription: { userId: 167, basePlanId: 'lite-m1' },
    });
    expect(subscriptionsService.subscribeGooglePlay).toHaveBeenCalledWith(
      167,
      dto,
    );
  });

  it('keeps Google Play subscribe payload fields after global whitelist validation', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    const result = await pipe.transform(
      {
        platform: 'android',
        packageName: 'app.package',
        productId: 'nemory',
        purchaseToken: 'purchase-token',
      },
      {
        type: 'body',
        metatype: SubscribeGooglePlayDto,
      } as any,
    );

    expect(result).toEqual({
      packageName: 'app.package',
      purchaseToken: 'purchase-token',
    });
  });

  it('routes all-user migration preview to dry-run service with a normalized chunk size', async () => {
    (legacyDryRunService.previewAllUsers as any).mockResolvedValueOnce({
      totalUsers: 2,
    });

    const result = await controller.previewUsersMigration('25');

    expect(result).toEqual({ totalUsers: 2 });
    expect(legacyDryRunService.previewAllUsers).toHaveBeenCalledWith(25);
  });

  it('routes all-user migration run to migration service with default chunk size', async () => {
    (migrationService.migrateAllUsers as any).mockResolvedValueOnce({
      totalUsers: 2,
    });

    const result = await controller.runUsersMigration();

    expect(result).toEqual({ totalUsers: 2 });
    expect(migrationService.migrateAllUsers).toHaveBeenCalledWith(100);
  });

  it('rejects invalid chunk sizes before calling services', async () => {
    await expect(
      controller.previewUsersMigration('0'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.runUsersMigration({ chunkSize: 501 }),
    ).rejects.toThrow(BadRequestException);

    expect(legacyDryRunService.previewAllUsers).not.toHaveBeenCalled();
    expect(migrationService.migrateAllUsers).not.toHaveBeenCalled();
  });
});

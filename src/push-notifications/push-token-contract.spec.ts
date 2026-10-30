import { expect, it, jest } from '@jest/globals';
import { saveOwnedPushToken } from './push-token-ownership';

it('preserves the legacy empty push token error before touching persistence', async () => {
  const manager = { query: jest.fn(), getRepository: jest.fn() };
  try {
    await saveOwnedPushToken(manager as any, 1, {
      token: '  ',
      platform: 'android',
    });
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      code: 'PUSH_TOKEN_IS_EMPTY',
      message: 'Push token is empty',
    });
  }
  expect(manager.query).not.toHaveBeenCalled();
  expect(manager.getRepository).not.toHaveBeenCalled();
});

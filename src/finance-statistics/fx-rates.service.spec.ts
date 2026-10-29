import { describe, expect, it, jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { FxRatesService } from './fx-rates.service';
const day = new Date('2026-10-20T12:00:00Z');
const rates = [
  { cc: 'USD', rate: 40, exchangedate: '20.10.2026' },
  { cc: 'EUR', rate: 48, exchangedate: '20.10.2026' },
];
describe('historical FX rates', () => {
  it('converts UAH and cross currencies from one shared dated NBU response', async () => {
    const http = { get: jest.fn(() => of({ data: rates })) };
    const service = new FxRatesService(
      http as any,
      { get: () => undefined } as any,
    );
    expect(
      await Promise.all([
        service.getUsdRate('UAH', day),
        service.getUsdRate('EUR', day),
        service.getUsdRate('USD', day),
      ]),
    ).toEqual([0.025, 1.2, 1]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it('rejects an incorrect rate date instead of silently using today', async () => {
    const service = new FxRatesService(
      { get: () => of({ data: rates }) } as any,
      { get: () => undefined } as any,
    );
    await expect(
      service.getUsdRate('UAH', new Date('2026-10-21')),
    ).rejects.toThrow();
    await expect(service.getUsdRate('', day)).rejects.toThrow();
  });
  it('allows retry after a temporary provider error', async () => {
    let failed = true;
    const service = new FxRatesService(
      {
        get: () =>
          failed ? throwError(() => new Error('offline')) : of({ data: rates }),
      } as any,
      { get: () => undefined } as any,
    );
    await expect(service.getUsdRate('UAH', day)).rejects.toThrow();
    failed = false;
    expect(await service.getUsdRate('UAH', day)).toBe(0.025);
  });
  it('preserves the configured OpenExchangeRates provider', async () => {
    const service = new FxRatesService(
      { get: () => of({ data: { rates: { UAH: 40 } } }) } as any,
      {
        get: (key: string) => (key === 'FX_API_KEY' ? 'test-key' : undefined),
      } as any,
    );
    expect(await service.getUsdRate('UAH', day)).toBe(0.025);
  });
});

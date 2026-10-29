import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FxRatesService {
  private cache = new Map<string, number>();
  private dailyRates = new Map<string, Promise<Record<string, number>>>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getUsdRate(fromCurrency: string, onDate: Date): Promise<number> {
    const ccy = (fromCurrency ?? '').toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(ccy)) throw new Error('[FX] Invalid currency');
    if (ccy === 'USD') return 1;

    const dateStr = onDate.toISOString().slice(0, 10);
    const key = `${dateStr}:${ccy}:USD`;
    const cached = this.cache.get(key);
    if (cached != null) return cached;

    const provider =
      this.config.get<string>('FX_PROVIDER') ??
      (this.config.get<string>('FX_API_KEY') ? 'openexchangerates' : 'nbu');
    if (provider === 'nbu') {
      let pending = this.dailyRates.get(dateStr);
      if (!pending) {
        pending = this.getNbuRates(dateStr);
        this.dailyRates.set(dateStr, pending);
        if (this.dailyRates.size > 400) {
          const oldest = this.dailyRates.keys().next();
          if (!oldest.done) this.dailyRates.delete(oldest.value);
        }
      }
      const rates = await pending;
      const value = rates[ccy] / rates.USD;
      if (!Number.isFinite(value) || value <= 0)
        throw new Error(`[FX] No ${ccy} rate on ${dateStr}`);
      return value;
    }
    const baseUrl =
      this.config.get<string>('FX_API_BASE_URL') ??
      'https://openexchangerates.org/api';
    const appId = this.config.get<string>('FX_API_KEY');

    if (!appId) {
      throw new Error('[FX] FX_API_KEY is missing');
    }

    if (provider === 'openexchangerates') {
      // Free plan: беремо historical daily rates і рахуємо самі
      const url = `${baseUrl}/historical/${dateStr}.json`;

      const response = await firstValueFrom(
        this.http.get(url, { params: { app_id: appId }, timeout: 8000 }),
      );
      const data = response.data as unknown;
      const rates =
        data && typeof data === 'object' && 'rates' in data
          ? (data as { rates?: unknown }).rates
          : null;
      const rateRecord =
        rates && typeof rates === 'object'
          ? (rates as Record<string, unknown>)
          : {};

      const perUsd = rateRecord[ccy]; // 1 USD = perUsd CCY
      if (
        !(typeof perUsd === 'number' && Number.isFinite(perUsd) && perUsd > 0)
      ) {
        throw new Error(`[FX] Missing/invalid rate for ${ccy} on ${dateStr}`);
      }

      const usdPerCcy = 1 / perUsd; // 1 CCY = usdPerCcy USD
      this.cache.set(key, usdPerCcy);
      if (this.cache.size > 2000) {
        const oldest = this.cache.keys().next();
        if (!oldest.done) this.cache.delete(oldest.value);
      }
      return usdPerCcy;
    }

    throw new Error(`[FX] Unsupported provider: ${provider}`);
  }

  private async getNbuRates(day: string): Promise<Record<string, number>> {
    try {
      const response = await firstValueFrom(
        this.http.get<unknown>(
          'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange',
          { params: { date: day.replace(/-/g, ''), json: '' }, timeout: 8000 },
        ),
      );
      if (!Array.isArray(response.data))
        throw new Error('[FX] Invalid NBU response');
      const rates: Record<string, number> = { UAH: 1 };
      const expectedDate = day.split('-').reverse().join('.');
      for (const row of response.data as {
        cc?: string;
        rate?: number;
        exchangedate?: string;
      }[]) {
        if (
          row.exchangedate === expectedDate &&
          row.cc &&
          typeof row.rate === 'number' &&
          row.rate > 0
        )
          rates[row.cc] = row.rate;
      }
      if (!rates.USD) throw new Error(`[FX] No USD rate on ${day}`);
      return rates;
    } catch (error) {
      this.dailyRates.delete(day);
      throw error;
    }
  }
}

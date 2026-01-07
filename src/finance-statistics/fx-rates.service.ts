import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FxRatesService {
  private cache = new Map<string, number>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getUsdRate(fromCurrency: string, onDate: Date): Promise<number> {
    const ccy = (fromCurrency ?? '').toUpperCase().trim();
    if (!ccy || ccy === 'USD') return 1;

    const dateStr = onDate.toISOString().slice(0, 10);
    const key = `${dateStr}:${ccy}:USD`;
    const cached = this.cache.get(key);
    if (cached != null) return cached;

    const provider =
      this.config.get<string>('FX_PROVIDER') ?? 'openexchangerates';
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

      const { data } = await firstValueFrom(
        this.http.get(url, { params: { app_id: appId } }),
      );

      const perUsd = data?.rates?.[ccy]; // 1 USD = perUsd CCY
      if (
        !(typeof perUsd === 'number' && Number.isFinite(perUsd) && perUsd > 0)
      ) {
        throw new Error(`[FX] Missing/invalid rate for ${ccy} on ${dateStr}`);
      }

      const usdPerCcy = 1 / perUsd; // 1 CCY = usdPerCcy USD
      this.cache.set(key, usdPerCcy);
      return usdPerCcy;
    }

    throw new Error(`[FX] Unsupported provider: ${provider}`);
  }
}

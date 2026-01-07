import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from '../../payments/entities/payment.entity';
import { TokenUsageHistory } from '../../tokens/entities/token-usage-history.entity';

// ⚠️ підстав свої enum-и/шляхи:
import { TokenType } from '../../tokens/types';
import { AiModel } from '../../users/types';

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function yyyyMmDd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const paymentsRepo = app.get<Repository<Payment>>(
    getRepositoryToken(Payment),
  );
  const tokenRepo = app.get<Repository<TokenUsageHistory>>(
    getRepositoryToken(TokenUsageHistory),
  );

  const DAYS = Number(process.env.SEED_DAYS ?? 90);
  const RESET = String(process.env.SEED_RESET ?? 'true') === 'true';

  if (RESET) {
    await tokenRepo.clear();
    await paymentsRepo.clear();
  }

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (DAYS - 1));
  start.setUTCHours(0, 0, 0, 0);

  const platforms = ['ios', 'android'] as const;
  const providers = ['openai', 'claude'] as const;

  // Реалістичні “ціни”
  const priceUsd = [2.99, 4.99, 6.99, 9.99, 14.99, 19.99];
  const priceEur = [2.99, 4.99, 7.99, 9.99, 14.99];
  const priceUah = [99, 149, 199, 249, 399, 499];

  // Реалістичні валюти/регіони (приблизно)
  const currencies: Array<{
    currency: 'USD' | 'EUR' | 'UAH';
    regionCode: string;
  }> = [
    { currency: 'USD', regionCode: 'US' },
    { currency: 'EUR', regionCode: 'DE' },
    { currency: 'EUR', regionCode: 'PL' },
    { currency: 'UAH', regionCode: 'UA' },
  ];

  // Для token usage: totalCredits, де 10000 = $1
  // Зробимо витрати ~ $1..$25 на день (в середньому), з “піками”
  const aiModels: AiModel[] = [
    AiModel.GPT_5_2 as any,
    AiModel.CLAUDE_SONNET_4_5 as any,
    AiModel.GPT_4_1 as any,
  ].filter(Boolean) as any;

  const tokenTypes: TokenType[] = [
    TokenType.ENTRY as any,
    TokenType.EMBEDDING as any,
  ].filter(Boolean) as any;

  const payments: Payment[] = [];
  const tokenRows: TokenUsageHistory[] = [];

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);

    // ---------- PAYMENTS ----------
    // Реалістично: 0..N покупок на день, тренд + сезонність
    const dow = day.getUTCDay(); // 0..6
    const weekendBoost = dow === 0 || dow === 6 ? 1.25 : 1.0;
    const trend = 0.6 + (i / DAYS) * 0.9; // ріст з часом
    const basePurchases = Math.max(
      0,
      Math.round(rand(0, 10) * weekendBoost * trend),
    );
    const purchases = randInt(0, basePurchases);

    for (let k = 0; k < purchases; k++) {
      const cur = pick(currencies);
      let amount =
        cur.currency === 'USD'
          ? pick(priceUsd)
          : cur.currency === 'EUR'
            ? pick(priceEur)
            : pick(priceUah);

      // трохи “розкид” цін (знижки/локальні прайси)
      amount = round2(amount * rand(0.95, 1.05));

      const p = paymentsRepo.create({
        platform: pick(platforms) as any,
        regionCode: cur.regionCode,
        orderId: `seed_${yyyyMmDd(day)}_${i}_${k}_${randInt(10000, 99999)}`,
        amount,
        currency: cur.currency,
        provider: pick(providers) as any,
        createdAt: new Date(day.getTime() + randInt(0, 86399) * 1000),
        user: null as any,
        plan: null as any,
      } as Partial<Payment>);

      payments.push(p);
    }

    // ---------- TOKEN USAGE (EXPENSES) ----------
    // В день робимо 30..200 подій usage (чат + ембеддінги)
    const events = randInt(30, 200);

    // базові витрати дня (в USD) з піками
    const spike = Math.random() < 0.08 ? rand(15, 45) : 0; // ~8% “пік”
    const dayUsd = rand(1, 18) + spike;
    const dayCredits = Math.round(dayUsd * 10000);

    // розкидаємо credits по подіях
    let remaining = dayCredits;

    for (let e = 0; e < events; e++) {
      const isLast = e === events - 1;
      const chunk = isLast
        ? remaining
        : Math.min(remaining, randInt(0, Math.round(dayCredits / 8)));
      remaining -= chunk;

      const inputCredits = Math.round(chunk * rand(0.45, 0.7));
      const outputCredits = Math.max(0, chunk - inputCredits);

      const row = tokenRepo.create({
        type: pick(tokenTypes) as any,
        aiModel: pick(aiModels) as any,
        input: randInt(50, 2500),
        output: randInt(50, 3500),
        inputCredits,
        outputCredits,
        totalCredits: inputCredits + outputCredits,
        finishReason: null,
        estimated: Math.random() < 0.25, // частина estimated
        estimateMethod: Math.random() < 0.25 ? 'ratio' : null,
        createdAt: new Date(day.getTime() + randInt(0, 86399) * 1000),
        user: null as any,
      });

      tokenRows.push(row);
      if (remaining <= 0) break;
    }
  }

  // INSERT пачками, щоб не задушити memory
  const BATCH = 2000;

  for (let i = 0; i < payments.length; i += BATCH) {
    await paymentsRepo.save(payments.slice(i, i + BATCH));
  }
  for (let i = 0; i < tokenRows.length; i += BATCH) {
    await tokenRepo.save(tokenRows.slice(i, i + BATCH));
  }

  console.log(
    `✅ Seed done: payments=${payments.length}, token_usage=${tokenRows.length}`,
  );

  await app.close();
}

main().catch((e) => {
  console.error('❌ Seed failed', e);
  process.exit(1);
});

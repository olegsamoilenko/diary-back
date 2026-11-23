import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Express, json } from 'express';

export function configureBodyParsers(app: NestExpressApplication): void {
  // A diagnostic batch can contain a full stack alongside lifecycle events.
  const express: Express = app.getHttpAdapter().getInstance();
  express.post('/logs', json({ limit: '1mb' }));
  // Full period snapshots can exceed Express's default 100 KB JSON body limit.
  app.use('/ai/periodic-analyses', json({ limit: '1mb' }));
  app.use('/ai/dialog-context', json({ limit: '1mb' }));
  // Nest detects jsonParser by name, even when mounted on just one route,
  // and skips its global default. Keep all other JSON endpoints working.
  app.use(json());
}

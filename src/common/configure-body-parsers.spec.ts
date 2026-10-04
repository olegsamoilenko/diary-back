import { afterAll, beforeAll, describe, it } from '@jest/globals';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureBodyParsers } from './configure-body-parsers';

@Controller()
class BodyProbeController {
  @Post([
    'sessions/refresh',
    'auth/sign-in-with-google',
    'ai/periodic-analyses',
    'ai/dialog-context/compress',
  ])
  echo(@Body() body: Record<string, unknown> | undefined) {
    return { body: body ?? null };
  }
}

@Module({ controllers: [BodyProbeController] })
class BodyProbeModule {}

describe('HTTP body parsers with periodic analysis payloads', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(BodyProbeModule, {
      logger: false,
    });
    configureBodyParsers(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });
  it('accepts a long dialogue for compression beyond the default 100 KB', async () => {
    const body = { source: 'History '.repeat(20000), retainedHistory: 'Recent turns' };
    await request(app.getHttpServer()).post('/ai/dialog-context/compress').send(body).expect(201, { body });
  });

  it.each(['/sessions/refresh', '/auth/sign-in-with-google'])(
    'preserves JSON fields on %s',
    async (path) => {
      const body = {
        userId: 167,
        uuid: '68e5380f-7b93-444c-9ea9-7eec5d60e933',
        deviceId: 'd48d7c89-8790-4eae-8f34-edb7fcc3d495',
        ts: 1790701200000,
      };
      await request(app.getHttpServer())
        .post(path)
        .send(body)
        .expect(201, { body });
    },
  );

  it('accepts period context above 100 KB', async () => {
    const body = { context: 'x'.repeat(150 * 1024) };
    await request(app.getHttpServer())
      .post('/ai/periodic-analyses')
      .send(body)
      .expect(201, { body });
  });

  it('retains the default JSON limit on auth routes', async () => {
    await request(app.getHttpServer())
      .post('/auth/sign-in-with-google')
      .send({ context: 'x'.repeat(150 * 1024) })
      .expect(413);
  });

  it('rejects period payloads above 1 MB', async () => {
    await request(app.getHttpServer())
      .post('/ai/periodic-analyses')
      .send({ context: 'x'.repeat(1024 * 1024) })
      .expect(413);
  });

  it('preserves the default URL-encoded parser', async () => {
    await request(app.getHttpServer())
      .post('/sessions/refresh')
      .type('form')
      .send({ userId: '167' })
      .expect(201, { body: { userId: '167' } });
  });
});

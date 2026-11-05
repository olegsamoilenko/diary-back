import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  ExecutionContext,
  INestApplication,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { MediaAnalysisController } from './media-analysis.controller';
import { MediaAnalysisService } from './media-analysis.service';
import { AiModel } from '../../users/types';
import { AiErrorReporterService } from '../../ai-errors/ai-error-reporter.service';
import { CaptureErrorFilter } from '../../common/filters/capture-error.filter';
import { ServerHttpLoggerMiddleware } from '../../common/middleware/server-http-logger.middleware';
import { sendAiErrorsTelegram } from '../../telegram/send-telegram';

jest.mock('../../telegram/send-telegram', () => ({
  sendAiErrorsTelegram: jest.fn(async () => {}),
}));

describe('NA21 real controller multipart compatibility', () => {
  let app: INestApplication;
  const upload = jest.fn(async () => ({ status: 'prepared' }));
  const restoreReplay = jest.fn(async () => ({ status: 'ready' }));
  const findOneBy = jest.fn(async () => null);
  const logHttpFailure = jest.fn(async () => {});
  const id = '11111111-1111-4111-8111-111111111111';
  const model = AiModel.GPT_5_6_TERRA;
  beforeAll(async () => {
    const media = new MediaAnalysisService(
      { findOneBy } as never,
      {} as never,
      {} as never,
    );
    const module = await Test.createTestingModule({
      controllers: [MediaAnalysisController],
      providers: [
        {
          provide: MediaAnalysisService,
          useValue: {
            upload,
            restoreReplay,
            status: media.status.bind(media),
            exportReplay: media.exportReplay.bind(media),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = { id: 7 };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new CaptureErrorFilter(new AiErrorReporterService()));
    const logger = new ServerHttpLoggerMiddleware({
      createServerHttpFail: logHttpFailure,
    } as never);
    app.use(logger.use.bind(logger));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(async () => app?.close());

  it('preserves the missing-media 404 contract without Telegram and permits replay restoration', async () => {
    await request(app.getHttpServer())
      .get(`/ai/media/${id}`)
      .query({ model })
      .expect(404, new NotFoundException().getResponse());
    expect(sendAiErrorsTelegram).not.toHaveBeenCalled();
    expect(logHttpFailure).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, level: 'warn' }),
    );
    await request(app.getHttpServer())
      .post(`/ai/media/${id}/replay`)
      .query({ model })
      .attach('file', Buffer.from('synthetic local replay'), 'replay.bin')
      .expect(201, { status: 'ready' });
    expect(restoreReplay).toHaveBeenCalledTimes(1);
    expect(sendAiErrorsTelegram).not.toHaveBeenCalled();
  });

  it.each([new NotFoundException(), new InternalServerErrorException()])(
    'still alerts for genuine status-probe failures: %s',
    async (error) => {
      findOneBy.mockRejectedValueOnce(error);
      await request(app.getHttpServer())
        .get(`/ai/media/${id}`)
        .query({ model })
        .expect(error.getStatus());
      expect(sendAiErrorsTelegram).toHaveBeenCalledTimes(1);
      expect(logHttpFailure).toHaveBeenCalledWith(
        expect.objectContaining({ status: error.getStatus(), level: 'error' }),
      );
    },
  );

  it('still alerts for a missing replay export on the adjacent endpoint', async () => {
    await request(app.getHttpServer())
      .get(`/ai/media/${id}/replay`)
      .expect(404);
    expect(sendAiErrorsTelegram).toHaveBeenCalledTimes(1);
    expect(logHttpFailure).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, level: 'error' }),
    );
  });

  it.each(['image', 'audio', 'video'])(
    'preserves %s buffer, MIME and form fields',
    async (kind) => {
      const buffer = Buffer.from('small synthetic media');
      await request(app.getHttpServer())
        .post('/ai/media/prepare')
        .field('id', id)
        .field('kind', kind)
        .field('model', model)
        .attach('file', buffer, {
          filename: 'sample',
          contentType: `${kind}/test`,
        })
        .expect(201, { status: 'prepared' });
      expect(upload).toHaveBeenCalledWith(7, id, kind, model, buffer);
    },
  );
  it('preserves replay upload', async () => {
    const buffer = Buffer.from('small synthetic replay');
    await request(app.getHttpServer())
      .post(`/ai/media/${id}/replay`)
      .query({ model })
      .attach('file', buffer, 'replay.bin')
      .expect(201, { status: 'ready' });
    expect(restoreReplay).toHaveBeenCalledWith(7, id, model, buffer);
  });
  it('rejects missing boundary without calling the upload service', async () => {
    await request(app.getHttpServer())
      .post('/ai/media/prepare')
      .set('Content-Type', 'multipart/form-data')
      .send('invalid')
      .expect(400);
    expect(upload).not.toHaveBeenCalled();
  });
  it('rejects a truncated multipart request without calling the upload service', async () => {
    await request(app.getHttpServer())
      .post('/ai/media/prepare')
      .set('Content-Type', 'multipart/form-data; boundary=small-test')
      .send(
        '--small-test\r\nContent-Disposition: form-data; name="file"; filename="test"\r\nContent-Type: image/png\r\n\r\npartial',
      )
      .expect(400);
    expect(upload).not.toHaveBeenCalled();
  });
  it('keeps the existing one-file restriction', async () => {
    await request(app.getHttpServer())
      .post('/ai/media/prepare')
      .field('id', id)
      .field('kind', 'image')
      .field('model', model)
      .attach('file', Buffer.from('a'), 'one.png')
      .attach('file', Buffer.from('b'), 'two.png')
      .expect(400);
    expect(upload).not.toHaveBeenCalled();
  });
});

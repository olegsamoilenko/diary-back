import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

describe('Auth endpoints (e2e)', () => {
  let app: INestApplication;

  const authService = {
    login: jest.fn(),
    createToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req, _res, next) => {
      req.clientIp = req.headers['x-forwarded-for'] || req.ip || null;
      req.clientUa = req.headers['x-client-ua'] || null;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/login passes credentials and client metadata to AuthService', async () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password1!',
      uuid: 'uuid-1',
      deviceId: 'device-1',
      devicePubKey: 'device-pub-key',
    };

    (authService.login as any).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 167 },
      plan: { id: 59, actual: true },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-client-ua', 'test-agent')
      .set('x-forwarded-for', '10.0.0.1')
      .send(loginDto)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          accessToken: 'access',
          refreshToken: 'refresh',
          user: { id: 167 },
          plan: { id: 59, actual: true },
        });
      });

    expect(authService.login).toHaveBeenCalledWith(
      loginDto,
      'test-agent',
      '10.0.0.1',
    );
  });

  it('POST /auth/create-token passes uuid and hash to AuthService', async () => {
    (authService.createToken as any).mockResolvedValueOnce({
      accessToken: 'access',
    });

    await request(app.getHttpServer())
      .post('/auth/create-token')
      .send({ uuid: 'uuid-1', hash: 'hash-1' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ accessToken: 'access' });
      });

    expect(authService.createToken).toHaveBeenCalledWith('uuid-1', 'hash-1');
  });
});

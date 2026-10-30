import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  Controller,
  Get,
  INestApplication,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule, AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersService } from '../users/users.service';
import { userAccessClaims } from './user-access-claims';

jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

@Controller('na05-protected')
class ProtectedController {
  @Get()
  @UseGuards(AuthGuard('jwt'))
  read(@Req() req: any) {
    return { id: req.user.id, uuid: req.user.uuid };
  }
}

describe('NA05 real HTTP authentication', () => {
  const secret = 'local-na05-http-secret';
  const oldSecret = process.env.JWT_SECRET;
  const jwt = new JwtService({ secret });
  const user = {
    id: 3,
    uuid: 'registered',
    password: 'synthetic-bcrypt-before',
    hash: 'legacy-hash',
    email: 'test@example.test',
    name: 'Test',
  };
  let app: INestApplication;
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [AuthController, ProtectedController],
      providers: [
        JwtStrategy,
        {
          provide: AuthService,
          useValue: Object.create(AuthService.prototype),
        },
        {
          provide: UsersService,
          useValue: {
            findById: async (id: number) => (id === user.id ? user : null),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  const read = (token: string) =>
    request(app.getHttpServer())
      .get('/na05-protected')
      .auth(token, { type: 'bearer' });

  it('closes static uuid/hash login with a 401 response, including with old bearer attached', async () => {
    for (const bearer of ['', jwt.sign(user)]) {
      const call = request(app.getHttpServer())
        .post('/auth/create-token')
        .send({ uuid: user.uuid, hash: user.hash });
      if (bearer) call.auth(bearer, { type: 'bearer' });
      await call.expect(401);
    }
  });
  it('accepts pre-deploy/new JWTs, rejects both after reset, and accepts newly issued JWT', async () => {
    const old = jwt.sign(user);
    const current = jwt.sign(userAccessClaims(user, secret));
    await read(old).expect(200, { id: 3, uuid: 'registered' });
    await read(current).expect(200);
    user.password = 'synthetic-bcrypt-after';
    await read(old).expect(401);
    await read(current).expect(401);
    await read(jwt.sign(userAccessClaims(user, secret))).expect(200);
  });
  it('rejects expired, forged, missing and deleted-user credentials', async () => {
    await read(jwt.sign(user, { expiresIn: -1 })).expect(401);
    await read(new JwtService({ secret: 'attacker-secret' }).sign(user)).expect(
      401,
    );
    await read(jwt.sign({ ...user, id: 777 })).expect(401);
    await request(app.getHttpServer()).get('/na05-protected').expect(401);
  });
});

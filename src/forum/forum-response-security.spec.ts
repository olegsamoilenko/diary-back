import { UsersService } from 'src/users/users.service';
import { ForumReportsController } from './controllers/forum-reports.controller';
import { ForumReportsService } from './services/forum-reports.service';
import { ForumAiModerationResultsController } from './controllers/forum-ai-moderation-results.controller';
import { ForumAiModerationResultsService } from './services/forum-ai-moderation-results.service';
import { ForumModerationController } from './controllers/forum-moderation.controller';
import { ForumModerationService } from './services/forum-moderation.service';
import { ForumNotificationsController } from './controllers/forum-notifications.controller';
import { ForumNotificationsService } from './services/forum-notifications.service';
import { ForumMentionsController } from './controllers/forum-mentions.controller';
import { ForumMentionsService } from './services/forum-mentions.service';
import { ForumUserBlocksController } from './controllers/forum-user-blocks.controller';
import { ForumUserBlocksService } from './services/forum-user-blocks.service';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminJwtStrategy } from '../auth/strategies/admin-jwt.strategies';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AdminsService } from '../admins/admins.service';
import { ForumTopicsController } from './controllers/forum-topics.controller';
import { ForumCommentsController } from './controllers/forum-comments.controller';
import { ForumBookmarksController } from './controllers/forum-bookmarks.controller';
import { ForumConversationsController } from './controllers/forum-conversations.controller';
import { ForumMessagesController } from './controllers/forum-messages.controller';
import { ForumModerationLogsController } from './controllers/forum-moderation-logs.controller';
import { AdminForumController } from './controllers/admin-forum.controller';
import { ForumUserRestrictionsController } from './controllers/forum-user-restrictions.controller';
import { ForumTopicsService } from './services/forum-topics.service';
import { ForumCommentsService } from './services/forum-comments.service';
import { ForumBookmarksService } from './services/forum-bookmarks.service';
import { ForumConversationsService } from './services/forum-conversations.service';
import { ForumMessagesService } from './services/forum-messages.service';
import { ForumModerationLogsService } from './services/forum-moderation-logs.service';
import { AdminForumService } from './services/admin-forum.service';
import { ForumUserRestrictionsService } from './services/forum-user-restrictions.service';
import { projectForumResponse } from './forum-response-projection';

jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

const secretFields = {
  password: 'SENSITIVE-password',
  hash: 'SENSITIVE-hash',
  passwordResetCode: 'SENSITIVE-reset',
  passwordChangeToken: 'SENSITIVE-token',
  emailVerificationCode: 'SENSITIVE-email-code',
  dekEncrypted: 'SENSITIVE-dek',
  sessions: ['SENSITIVE-session'],
  futureSecret: 'SENSITIVE-future',
};
const profile = {
  id: 'profile-42',
  userId: 42,
  username: 'public-nick',
  displayName: 'Public name',
  avatarUrl: '/avatar.png',
  ...secretFields,
};
const user = {
  id: 42,
  uuid: 'private-user-uuid',
  name: 'Private name',
  email: 'private@example.com',
  role: 'forum_moderator',
  settings: { lang: 'uk', ...secretFields },
  ...secretFields,
  forumPublicProfile: profile,
};
const author = { authorId: 42, author: user, authorProfile: profile };
const comment = {
  id: 'comment-1',
  ...author,
  content: 'Visible comment',
  likedByMe: true,
  parentComment: { id: 'parent', ...author },
  replyToComment: { id: 'reply-to', ...author },
};
const fixture = {
  id: 'topic-1',
  ...author,
  title: 'Visible title',
  content: 'Visible body',
  createdAt: new Date('2026-10-29T00:00:00Z'),
  nextCursor: 'opaque-cursor',
  hasMore: true,
  replies: [comment],
  items: [{ topic: { ...author }, ...comment }],
  userOneId: 41,
  userTwoId: 42,
  userOne: user,
  userTwo: user,
  sender: user,
  recipient: user,
  targetUser: user,
  blockedUser: user,
  actor: user,
  mentionedByUser: user,
  reporter: user,
  reporterProfile: profile,
  authorSettings: { id: 10, userId: 42, lang: 'uk', ...secretFields },
  createdByAdmin: { id: 8, name: 'Moderator', role: 'ADMIN', ...secretFields },
  moderator: { id: 8, name: 'Moderator', role: 'ADMIN', ...secretFields },
};
const services = [
  ForumReportsService,
  ForumAiModerationResultsService,
  ForumModerationService,
  ForumNotificationsService,
  ForumMentionsService,
  ForumUserBlocksService,
  ForumTopicsService,
  ForumCommentsService,
  ForumBookmarksService,
  ForumConversationsService,
  ForumMessagesService,
  ForumModerationLogsService,
  AdminForumService,
];
const controllers = [
  ForumReportsController,
  ForumAiModerationResultsController,
  ForumModerationController,
  ForumNotificationsController,
  ForumMentionsController,
  ForumUserBlocksController,
  ForumTopicsController,
  ForumCommentsController,
  ForumBookmarksController,
  ForumConversationsController,
  ForumMessagesController,
  ForumModerationLogsController,
  AdminForumController,
];
const mocks = new Map(
  services.map((service) => [
    service,
    Object.fromEntries(
      Object.getOwnPropertyNames(service.prototype)
        .filter((name) => name !== 'constructor')
        .map((name) => [
          name,
          jest.fn(async (..._args: unknown[]) =>
            name === 'getUserByRole' ? user : fixture,
          ),
        ]),
    ),
  ]),
);
const routes = controllers.flatMap((controller) =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) =>
      Reflect.hasMetadata(METHOD_METADATA, controller.prototype[name]),
    )
    .map((name) => ({
      name,
      admin:
        (controller === ForumReportsController && name !== 'createReport') ||
        [
          ForumModerationLogsController,
          AdminForumController,
          ForumModerationController,
          ForumAiModerationResultsController,
        ].includes(controller as never),
      method: Reflect.getMetadata(
        METHOD_METADATA,
        controller.prototype[name],
      ) as RequestMethod,
      path: `/${Reflect.getMetadata(PATH_METADATA, controller)}/${Reflect.getMetadata(PATH_METADATA, controller.prototype[name])}`
        .replace(/\/+$/g, '')
        .replace(/:targetUserId/g, '42')
        .replace(/:userId/g, '42')
        .replace(/:targetType/g, 'topic')
        .replace(/:role/g, 'nemory')
        .replace(/:[A-Za-z]+/g, 'synthetic-id'),
    })),
);

describe('NA-10/28 forum HTTP identities and moderation access', () => {
  let app: INestApplication;
  const oldSecret = process.env.JWT_SECRET;
  const jwt = new JwtService();
  const appSecret = 'synthetic-forum-client';
  const adminSecret = 'synthetic-forum-admin';
  const token = (id = 41) =>
    jwt.sign({ id, uuid: `synthetic-${id}` }, { secret: appSecret });
  const adminToken = () =>
    jwt.sign({ id: '8', type: 'admin' }, { secret: adminSecret });
  const findAdmin = jest.fn(async () => ({
    id: 8,
    name: 'Moderator',
    role: 'ADMIN',
    active: true,
  }));
  const findConversation = jest.fn(async () => fixture);
  const readMessages = jest.fn(async () => [[fixture], 1]);
  const restrictUser = jest.fn(async (..._args: unknown[]) => ({
    success: true,
  }));
  const unrestrictUser = jest.fn(async (..._args: unknown[]) => ({
    success: true,
  }));
  const call = (route: (typeof routes)[number]) => {
    const http = request(app.getHttpServer());
    if (route.method === RequestMethod.GET) return http.get(route.path);
    if (route.method === RequestMethod.DELETE) return http.delete(route.path);
    if (route.method === RequestMethod.PATCH)
      return http.patch(route.path).send({ content: 'Text', userId: 42 });
    return http
      .post(route.path)
      .send({ content: 'Text', categories: [], userId: 42 });
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = appSecret;
    // Real ownership checks on conversation/message reads, repositories only mocked.
    const conversations = new ForumConversationsService(
      { findOne: findConversation } as never,
      {} as never,
    );
    const messages = new ForumMessagesService(
      { findAndCount: readMessages } as never,
      { findOne: findConversation } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    mocks.get(ForumConversationsService)!.getConversation = jest.fn(
      conversations.getConversation.bind(conversations),
    ) as never;
    mocks.get(ForumMessagesService)!.getConversationMessages = jest.fn(
      messages.getConversationMessages.bind(messages),
    ) as never;
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [...controllers, ForumUserRestrictionsController],
      providers: [
        JwtStrategy,
        {
          provide: UsersService,
          useValue: {
            findById: async (id: number) => ({ id, uuid: `synthetic-${id}` }),
          },
        },
        AdminJwtStrategy,
        { provide: ConfigService, useValue: { get: () => adminSecret } },
        { provide: AdminsService, useValue: { findById: findAdmin } },
        ...services.map((service) => ({
          provide: service,
          useValue: mocks.get(service),
        })),
        {
          provide: ForumUserRestrictionsService,
          useValue: {
            restrictUser,
            unrestrictUser,
            getActiveUserRestriction: async () => ({
              isRestricted: true,
              restriction: {
                user,
                userId: 42,
                createdByAdmin: fixture.createdByAdmin,
                createdByAdminId: 8,
              },
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  describe.each(routes)('$path [$name]', (route) => {
    it('rejects anonymous access', async () => {
      await call(route).expect(401);
    });
    it('returns the allowed identity without secret fields for reads and mutations', async () => {
      const req = call(route);
      const result = await (route.admin
        ? req.set('Cookie', `admin_session=${adminToken()}`)
        : req.auth(token(), { type: 'bearer' }));
      expect(result.status).toBe(
        route.method === RequestMethod.POST ? 201 : 200,
      );
      expect(JSON.stringify(result.body)).not.toContain('SENSITIVE-');
      if (!route.admin) {
        for (const value of [
          'private-user-uuid',
          'Private name',
          'private@example.com',
        ])
          expect(JSON.stringify(result.body)).not.toContain(value);
        expect(JSON.stringify(result.body)).toContain('public-nick');
      } else if (route.name !== 'getUserByRole') {
        expect(result.body.author).toMatchObject({
          id: 42,
          uuid: 'private-user-uuid',
          name: 'Private name',
          email: 'private@example.com',
          settings: { lang: 'uk' },
        });
        expect(result.body.moderator).toEqual({
          id: 8,
          name: 'Moderator',
          role: 'ADMIN',
        });
      } else
        expect(result.body).toMatchObject({ id: 42, settings: { lang: 'uk' } });
    });
    if (route.admin)
      it('rejects an ordinary app JWT', async () => {
        await call(route).auth(token(), { type: 'bearer' }).expect(401);
      });
  });
  it.each([
    '/forum/conversations/synthetic-id',
    '/forum/messages/conversation/synthetic-id',
  ])('still rejects nonmembers: %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .auth(token(99), { type: 'bearer' })
      .expect(403);
    expect(readMessages).not.toHaveBeenCalled();
  });
  it('keeps the exact user ID for ban and unban from the sanitized moderation target', async () => {
    const result = await request(app.getHttpServer())
      .get('/admin/forum/moderation-target/topic/synthetic-id')
      .set('Cookie', `admin_session=${adminToken()}`)
      .expect(200);
    const id = result.body.authorId;
    expect(id).toBe(42);
    expect(result.body.author.id).toBe(id);
    const body = {
      type: 'permanent_ban',
      reason: 'Synthetic test',
      createdByAdminId: 8,
    };
    await request(app.getHttpServer())
      .post(`/forum/user-restrictions/${id}/restrict`)
      .set('Cookie', `admin_session=${adminToken()}`)
      .send(body)
      .expect(201);
    expect(restrictUser).toHaveBeenCalledWith(42, body);
    await request(app.getHttpServer())
      .post(`/forum/user-restrictions/${id}/unrestrict`)
      .set('Cookie', `admin_session=${adminToken()}`)
      .send({ createdByAdminId: 8 })
      .expect(201);
    expect(unrestrictUser).toHaveBeenCalledWith(42, { createdByAdminId: 8 });
  });
  it('preserves ban target and issuing admin identities without exposing credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/forum/user-restrictions/42/get-active-restriction')
      .set('Cookie', `admin_session=${adminToken()}`)
      .expect(200);
    expect(res.body.restriction.user).toMatchObject({
      id: 42,
      name: 'Private name',
      email: 'private@example.com',
    });
    expect(res.body.restriction.createdByAdmin).toEqual({
      id: 8,
      name: 'Moderator',
      role: 'ADMIN',
    });
    expect(JSON.stringify(res.body)).not.toContain('SENSITIVE-');
    await request(app.getHttpServer())
      .get('/forum/user-restrictions/42/get-active-restriction')
      .auth(token(), { type: 'bearer' })
      .expect(401);
  });
  it('preserves timestamps, content, cursors, deleted authors and does not mutate entities', () => {
    const result = projectForumResponse(
      { ...fixture, missing: { author: null }, success: true },
      'public',
    ) as Record<string, unknown>;
    expect(result).toMatchObject({
      title: 'Visible title',
      content: 'Visible body',
      createdAt: fixture.createdAt,
      nextCursor: 'opaque-cursor',
      hasMore: true,
      missing: { author: null },
      success: true,
    });
    expect(user.password).toBe('SENSITIVE-password');
  });
});

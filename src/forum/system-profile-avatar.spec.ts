import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Repository } from 'typeorm';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  unlink,
  rmdir,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { ForumPublicProfilesService } from './services/forum-public-profiles.service';
import { ForumPublicProfile } from './entities/forum-public-profile.entity';
import { User } from '../users/entities/user.entity';

describe('System profile avatar HTTP and storage', () => {
  let app: INestApplication;
  let root: string;
  let directory: string;
  let png: Buffer;
  let profile: { id: string; userId: number; avatarUrl: string };
  const oldUploadsDir = process.env.UPLOADS_DIR;
  const users = { findOne: jest.fn<(...args: any[]) => Promise<any>>() };
  const profiles = {
    findOne: jest.fn<(...args: any[]) => Promise<any>>(),
    update: jest.fn<(...args: any[]) => Promise<any>>(),
    exists: jest.fn<(...args: any[]) => Promise<boolean>>(),
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'nemory-avatar-'));
    process.env.UPLOADS_DIR = root;
    directory = join(root, 'forum', 'avatars');
    png = await readFile(
      join(process.cwd(), 'src/seeds/assets/forum-system-avatars/nemory.png'),
    );
    // Import after setting the isolated upload directory; never touch real avatars.
    const { ForumPublicProfilesController } = await import(
      './controllers/forum-public-profiles.controller'
    );
    const module = await Test.createTestingModule({
      controllers: [ForumPublicProfilesController],
      providers: [
        {
          provide: ForumPublicProfilesService,
          useValue: new ForumPublicProfilesService(
            profiles as unknown as Repository<ForumPublicProfile>,
            users as unknown as Repository<User>,
          ),
        },
      ],
    })
      .overrideGuard(AuthGuard('admin-jwt'))
      .useValue({
        canActivate: (context: ExecutionContext) =>
          context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string> }>().headers
            .authorization === 'test-admin',
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    profile = {
      id: 'profile',
      userId: 7,
      avatarUrl: '/uploads/forum/avatars/old.png',
    };
    users.findOne.mockImplementation(async ({ where }) =>
      where.id === 7 && where.isSystem ? { id: 7, isSystem: true } : null,
    );
    profiles.findOne.mockImplementation(async () => ({ ...profile }));
    profiles.update.mockImplementation(async (_id, fields) => {
      Object.assign(profile, fields);
      return { affected: 1 };
    });
    profiles.exists.mockImplementation(
      async ({ where }) => where.avatarUrl === profile.avatarUrl,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'old.png'), png);
  });

  afterAll(async () => {
    await app?.close();
    if (oldUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = oldUploadsDir;
    if (root) {
      for (const file of await readdir(directory))
        await unlink(join(directory, file));
      await rmdir(directory);
      await rmdir(join(root, 'forum'));
      await rmdir(root);
    }
  });

  const upload = (id = '7') =>
    request(app.getHttpServer()).patch(`/forum/profiles/system/${id}/avatar`);

  it('rejects anonymous and non-admin requests before persistence', async () => {
    await upload().attach('avatar', png, 'avatar.png').expect(403);
    await upload()
      .set('Authorization', 'ordinary-user')
      .attach('avatar', png, 'avatar.png')
      .expect(403);
    expect(users.findOne).not.toHaveBeenCalled();
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('changes a system avatar with a fresh URL and cleans up in UPLOADS_DIR', async () => {
    const response = await upload()
      .set('Authorization', 'test-admin')
      .attach('avatar', png, 'avatar.png')
      .expect(200);
    const url = response.body.avatarUrl as string;
    expect(url).toMatch(/^\/uploads\/forum\/avatars\/[a-f0-9-]+\.png$/);
    expect(await readFile(join(directory, url.split('/').pop()!))).toEqual(png);
    await expect(readFile(join(directory, 'old.png'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(profiles.update).toHaveBeenCalledTimes(1);
  });

  it('rejects ordinary or missing users without writing an avatar', async () => {
    const before = await readdir(directory);
    await upload('999')
      .set('Authorization', 'test-admin')
      .attach('avatar', png, 'avatar.png')
      .expect(404);
    expect(await readdir(directory)).toEqual(before);
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('preserves an old file still referenced by another profile', async () => {
    profiles.exists.mockResolvedValue(true);
    await upload()
      .set('Authorization', 'test-admin')
      .attach('avatar', png, 'avatar.png')
      .expect(200);
    expect(await readFile(join(directory, 'old.png'))).toEqual(png);
  });

  it('rejects invalid ids, missing files, spoofed images and SVG', async () => {
    await upload('bad')
      .set('Authorization', 'test-admin')
      .attach('avatar', png, 'avatar.png')
      .expect(400);
    await upload().set('Authorization', 'test-admin').expect(400);
    await upload()
      .set('Authorization', 'test-admin')
      .attach('avatar', Buffer.from('<script>alert(1)</script>'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    await upload()
      .set('Authorization', 'test-admin')
      .attach(
        'avatar',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'test.svg',
      )
      .expect(400);
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('rejects files over 2 MiB', async () => {
    await upload()
      .set('Authorization', 'test-admin')
      .attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), 'large.png')
      .expect(413);
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('keeps the old avatar and removes the new file if persistence fails', async () => {
    const before = await readdir(directory);
    profiles.update.mockRejectedValueOnce(new Error('database unavailable'));
    await upload()
      .set('Authorization', 'test-admin')
      .attach('avatar', png, 'avatar.png')
      .expect(500);
    expect(profile.avatarUrl).toBe('/uploads/forum/avatars/old.png');
    expect(await readdir(directory)).toEqual(before);
    expect(await readFile(join(directory, 'old.png'))).toEqual(png);
  });
});

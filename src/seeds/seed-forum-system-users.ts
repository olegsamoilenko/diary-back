import { DataSource } from 'typeorm';
import AppDataSource from '../../data-source';
import { User } from 'src/users/entities/user.entity';
import { ForumPublicProfile } from 'src/forum/entities/forum-public-profile.entity';
import { Role } from 'src/users/types';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';

const uploadsRoot = process.env.UPLOADS_DIR || '/var/www/nemory-uploads';
const avatarUploadDir = join(uploadsRoot, 'forum', 'avatars');

function seedAvatar(assetFileName: string, targetFileName: string): string {
  const sourcePath = join(
    process.cwd(),
    'src',
    'seeds',
    'assets',
    'forum-system-avatars',
    assetFileName,
  );

  if (!existsSync(sourcePath)) {
    throw new Error(`[seed] avatar asset not found: ${sourcePath}`);
  }

  if (!existsSync(avatarUploadDir)) {
    mkdirSync(avatarUploadDir, { recursive: true });
  }

  const targetPath = join(avatarUploadDir, targetFileName);

  copyFileSync(sourcePath, targetPath);

  return `/uploads/forum/avatars/${targetFileName}`;
}

const SYSTEM_USERS = [
  {
    uuid: '00000000-0000-0000-0000-000000000001',
    hash: 'system:nemory',
    role: Role.NEMORY,
    name: 'Nemory',
    username: 'Nemory',
    bio: 'Official Nemory account',
    avatarAsset: 'nemory.webp',
  },
  {
    uuid: '00000000-0000-0000-0000-000000000002',
    hash: 'system:forum_admin',
    role: Role.FORUM_ADMIN,
    name: 'Admin',
    username: 'Admin',
    bio: 'Official Nemory admin account',
    avatarAsset: 'admin.webp',
  },
  {
    uuid: '00000000-0000-0000-0000-000000000003',
    hash: 'system:forum_moderator',
    role: Role.FORUM_MODERATOR,
    name: 'Moderator',
    username: 'Moderator',
    bio: 'Official Nemory moderation account',
    avatarAsset: 'moderator.webp',
  },
];

async function upsertSystemUser(
  dataSource: DataSource,
  item: (typeof SYSTEM_USERS)[number],
) {
  const usersRepo = dataSource.getRepository(User);
  const profilesRepo = dataSource.getRepository(ForumPublicProfile);

  let user = await usersRepo.findOne({
    where: { uuid: item.uuid },
  });

  if (!user) {
    user = usersRepo.create({
      uuid: item.uuid,
      hash: item.hash,
      name: item.name,
      role: item.role,
      isSystem: true,
      isRegistered: false,
      isLogged: false,
      usesWithoutSubscription: false,
      email: null,
      phone: null,
      regionCode: 'SYSTEM',
      acquisitionSource: 'system',
      acquisitionMetaJson: {},
    });

    user = await usersRepo.save(user);
  } else {
    await usersRepo.update(user.id, {
      name: item.name,
      role: item.role,
      isSystem: true,
      regionCode: 'SYSTEM',
    });
  }

  const profile = await profilesRepo.findOne({
    where: { userId: user.id },
  });

  const avatarUrl = seedAvatar(item.avatarAsset, item.avatarAsset);

  if (!profile) {
    await profilesRepo.save(
      profilesRepo.create({
        userId: user.id,
        displayName: item.username,
        username: item.username,
        usernameChangedAt: null,
        avatarUrl,
        bio: item.bio,
        isForumEnabled: true,
        allowDirectMessages: false,
        isBanned: false,
        banReason: null,
      }),
    );
  } else {
    await profilesRepo.update(profile.id, {
      displayName: item.username,
      username: item.username,
      avatarUrl,
      bio: item.bio,
      isForumEnabled: true,
      allowDirectMessages: false,
      isBanned: false,
      banReason: null,
    });
  }
}

async function bootstrap() {
  const dataSource = await AppDataSource.initialize();

  try {
    for (const item of SYSTEM_USERS) {
      await upsertSystemUser(dataSource, item);
      console.log(`[seed] forum system user ready: ${item.username}`);
    }

    console.log('[seed] forum system users completed');
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error('[seed] forum system users failed', error);
  process.exit(1);
});

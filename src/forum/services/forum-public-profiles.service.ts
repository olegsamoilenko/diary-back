import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { Repository } from 'typeorm';
import { UpdateForumPublicProfileDto } from '../dto/update-forum-public-profile.dto';
import { User } from 'src/users/entities/user.entity';
import * as fs from 'fs/promises';
import { join } from 'path';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';

@Injectable()
export class ForumPublicProfilesService {
  constructor(
    @InjectRepository(ForumPublicProfile)
    private readonly profilesRepo: Repository<ForumPublicProfile>,

    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async getMe(userId: number) {
    return this.getOrCreateProfile(userId);
  }

  async getByUserId(userId: number) {
    const profile = await this.profilesRepo.findOne({
      where: {
        userId,
        isForumEnabled: true,
      },
    });

    if (!profile) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Forum profile not found',
        'Forum profile not found',
        'FORUM_PROFILE_NOT_FOUND',
      );
    }

    return profile;
  }

  async getOrCreateProfile(userId: number) {
    let profile = await this.profilesRepo.findOne({
      where: { userId },
    });

    if (profile) return profile;

    const user = await this.usersRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    profile = this.profilesRepo.create({
      userId,
      displayName: this.buildDefaultDisplayName(user),
      username: null,
      avatarUrl: null,
      bio: null,
      isForumEnabled: true,
      allowDirectMessages: true,
      isBanned: false,
      banReason: null,
    });

    return this.profilesRepo.save(profile);
  }

  async updateMe(userId: number, dto: UpdateForumPublicProfileDto) {
    const profile = await this.getOrCreateProfile(userId);

    const displayName = dto.displayName?.trim();
    const username = dto.username?.trim().toLowerCase();
    const bio = dto.bio?.trim();
    const avatarUrl = dto.avatarUrl?.trim();

    if (displayName !== undefined && !displayName) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Display name cannot be empty',
        'Display name cannot be empty',
        'DISPLAY_NAME_CANNOT_BE_EMPTY',
      );
    }

    if (username) {
      const existing = await this.profilesRepo.findOne({
        where: { username },
      });

      if (existing && existing.userId !== userId) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Username is already taken',
          'Username is already taken',
          'USERNAME_IS_ALREADY_TAKEN',
        );
      }
    }

    await this.profilesRepo.update(profile.id, {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(username !== undefined ? { username: username || null } : {}),
      ...(bio !== undefined ? { bio: bio || null } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
      ...(dto.allowDirectMessages !== undefined
        ? { allowDirectMessages: dto.allowDirectMessages }
        : {}),
    });

    return this.getOrCreateProfile(userId);
  }

  async updateAvatar(userId: number, file: Express.Multer.File) {
    const newAvatarUrl = `/uploads/forum/avatars/${file.filename}`;

    try {
      const profile = await this.getOrCreateProfile(userId);
      const oldAvatarUrl = profile.avatarUrl;

      await this.profilesRepo.update(profile.id, {
        avatarUrl: newAvatarUrl,
      });

      if (oldAvatarUrl) {
        await this.deleteLocalAvatarFile(oldAvatarUrl);
      }

      return this.getOrCreateProfile(userId);
    } catch (e) {
      await this.deleteLocalAvatarFile(newAvatarUrl);
      throw e;
    }
  }

  private async deleteLocalAvatarFile(avatarUrl: string) {
    try {
      if (!avatarUrl.startsWith('/uploads/forum/avatars/')) return;

      const filename = avatarUrl.split('/').pop();
      if (!filename) return;

      const filePath = join(
        process.cwd(),
        'uploads',
        'forum',
        'avatars',
        filename,
      );

      await fs.unlink(filePath);
    } catch (e: any) {
      if (e?.code === 'ENOENT') return;

      console.warn('[ForumPublicProfilesService] Failed to delete old avatar', {
        avatarUrl,
        error: e?.message,
      });
    }
  }

  private buildDefaultDisplayName(user: User) {
    // підлаштуй під свою User entity
    const maybeName =
      (user as any).name ||
      (user as any).displayName ||
      (user as any).email?.split('@')?.[0];

    return maybeName || `User ${user.id}`;
  }
}

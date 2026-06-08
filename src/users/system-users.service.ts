import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Role } from './types';
import { ForumPublicProfile } from '../forum/entities/forum-public-profile.entity';
import { generateHash } from '../common/utils/generateHash';
import { SaltService } from '../salt/salt.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';

@Injectable()
export class SystemUsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,

    @InjectRepository(ForumPublicProfile)
    private forumPublicProfile: Repository<ForumPublicProfile>,

    private readonly saltService: SaltService,

    private readonly dataSource: DataSource,
  ) {}

  async getSystemUsers() {
    return await this.usersRepository.find({
      where: { isSystem: true },
      relations: ['forumPublicProfile'],
    });
  }

  async createSystemUser(data: {
    uuid: string;
    name: string;
    username: string;
  }) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saltValue = this.saltService.generateSalt();
        const hash = generateHash(data.uuid, saltValue);

        const userRepo = manager.getRepository(User);
        const profileRepo = manager.getRepository(ForumPublicProfile);

        const user = userRepo.create({
          uuid: data.uuid,
          hash,
          name: data.name,
          role: Role.USER,
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

        const savedUser = await userRepo.save(user);

        const existingProfile = await profileRepo.findOne({
          where: { username: data.username },
        });

        if (existingProfile) {
          throwError(
            HttpStatus.CONFLICT,
            'Username already exists',
            'Username already exists',
            'USERNAME_IS_ALREADY_TAKEN',
          );
        }

        const profile = profileRepo.create({
          userId: savedUser.id,
          displayName: data.username,
          username: data.username,
          usernameChangedAt: null,
          avatarUrl: null,
          bio: null,
          isForumEnabled: true,
          allowDirectMessages: false,
          isBanned: false,
          banReason: null,
        });

        await profileRepo.save(profile);

        return true;
      });
    } catch (error) {
      console.error('Error creating system user:', error);
      throw error;
    }
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ForumPublicProfilesService } from '../services/forum-public-profiles.service';
import { UpdateForumPublicProfileDto } from '../dto/update-forum-public-profile.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

const uploadsRoot = process.env.UPLOADS_DIR || '/var/www/nemory-uploads';
const avatarUploadDir = join(uploadsRoot, 'forum', 'avatars');

fs.mkdirSync(avatarUploadDir, { recursive: true });

@Controller('forum/profiles')
export class ForumPublicProfilesController {
  constructor(private readonly profilesService: ForumPublicProfilesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@ActiveUserData() user: ActiveUserDataT) {
    return this.profilesService.getMe(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  updateMe(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: UpdateForumPublicProfileDto,
  ) {
    return this.profilesService.updateMe(user.id, dto);
  }

  @Get('user/:userId')
  getByUserId(@Param('userId') userId: string) {
    return this.profilesService.getByUserId(Number(userId));
  }

  @Patch('avatar')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: avatarUploadDir,
        filename: (req, file, cb) => {
          const ext = extname(file.originalname) || '.webp';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only images are allowed'), false);
        }

        cb(null, true);
      },
    }),
  )
  async updateAvatar(
    @ActiveUserData() user: ActiveUserDataT,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    return this.profilesService.updateAvatar(user.id, file);
  }
}

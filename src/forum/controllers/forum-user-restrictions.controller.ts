import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';
import { RestrictForumUserDto } from '../dto/restrict-forum-user.dto';
import { ForumUserRestrictionsService } from '../services/forum-user-restrictions.service';
import { UnrestrictForumUserDto } from '../dto/unrestrict-forum-user.dto';

@Controller('forum/user-restrictions')
export class ForumUserRestrictionsController {
  constructor(
    private readonly forumUserRestrictionsService: ForumUserRestrictionsService,
  ) {}

  @UseGuards(AuthGuard('admin-jwt'))
  @Post(':restrictedUserId/restrict')
  restrictUser(
    @Param('restrictedUserId') restrictedUserId: string,
    @Body() dto: RestrictForumUserDto,
  ) {
    return this.forumUserRestrictionsService.restrictUser(
      Number(restrictedUserId),
      dto,
    );
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post(':unrestrictedUserId/unrestrict')
  unrestrictUser(
    @Param('unrestrictedUserId') unrestrictedUserId: string,
    @Body() dto: UnrestrictForumUserDto,
  ) {
    return this.forumUserRestrictionsService.unrestrictUser(
      Number(unrestrictedUserId),
      dto,
    );
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Get(':userId/get-active-restriction')
  getActiveUserRestriction(@Param('userId') userId: string) {
    return this.forumUserRestrictionsService.getActiveUserRestriction(
      Number(userId),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('is-user-restricted')
  isUserRestricted(@ActiveUserData() user: ActiveUserDataT) {
    return this.forumUserRestrictionsService.isUserRestricted(Number(user.id));
  }
}

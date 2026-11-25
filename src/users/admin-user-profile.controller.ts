import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminUserProfileService } from './admin-user-profile.service';

@UseGuards(AuthGuard('admin-jwt'))
@Controller('users/admin-profile')
export class AdminUserProfileController {
  constructor(private readonly profiles: AdminUserProfileService) {}

  @Post('search')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  search(@Body() body: unknown) {
    return this.profiles.search(body);
  }

  @Get(':id/tables/:key')
  @Header('Cache-Control', 'no-store')
  getDataset(
    @Param('id', ParseIntPipe) id: number,
    @Param('key') key: string,
    @Query('page') page?: string,
  ) {
    return this.profiles.records(id, key, page);
  }
}

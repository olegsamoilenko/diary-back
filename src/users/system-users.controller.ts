import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SystemUsersService } from './system-users.service';

@Controller('system-users')
export class SystemUsersController {
  constructor(private readonly systemUsersService: SystemUsersService) {}

  @UseGuards(AuthGuard('admin-jwt'))
  @Get('get-system-users')
  getSystemUsers() {
    return this.systemUsersService.getSystemUsers();
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post('create-system-user')
  createSystemUser(
    @Body() data: { uuid: string; name: string; username: string },
  ) {
    return this.systemUsersService.createSystemUser(data);
  }
}

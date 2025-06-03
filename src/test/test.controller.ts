import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@UseGuards(AuthGuard('jwt'))
@Controller('test')
export class TestController {
  @Get()
  getTest(): string {
    return 'Test endpoint is working!';
  }
}

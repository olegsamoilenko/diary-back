import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SupportService } from './support.service';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('create-message')
  async createMessage(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: CreateMessageDto,
  ) {
    return await this.supportService.createMessage(user.id, dto);
  }
}

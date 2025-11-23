import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SupportService } from './support.service';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { SupportMessageCategory, SupportMessageStatus } from './types';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('create-message')
  async createMessage(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: CreateMessageDto,
  ) {
    return await this.supportService.createMessage(user.id, dto);
  }

  @Get('get-messages')
  async getMessages(
    @Query('category') category: SupportMessageCategory,
    @Query('status') status: SupportMessageStatus,
    @Query('messageId') messageId: SupportMessageStatus,
    @Query('email') email: SupportMessageStatus,
    @Query('userUuid') userUuid: SupportMessageStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 50;
    return await this.supportService.getMessages(
      category,
      status,
      Number(messageId),
      email,
      userUuid,
      p,
      l,
    );
  }

  @Post('update-status/:id')
  async updateStatus(
    @Param('id') id: number,
    @Body() data: { status: SupportMessageStatus },
  ) {
    return await this.supportService.updateStatus(id, data.status);
  }
}

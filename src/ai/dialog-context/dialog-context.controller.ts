import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from 'src/auth/strategies/JwtAuthGuard';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { PlanGuard, AiCreditCycleId } from '../guards/plan.guard';
import { DialogContextService } from './dialog-context.service';
import { CompressDialogContextDto } from './dialog-context.dto';

@Controller('ai/dialog-context')
@UseGuards(JwtAuthGuard, PlanGuard)
export class DialogContextController {
  constructor(private readonly service: DialogContextService) {}
  @Post('compress')
  @AiCreditCycleId('requestId')
  async compress(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: CompressDialogContextDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    try {
      return await this.service.compress(user.id, dto, controller.signal);
    } finally {
      req.off('aborted', abort);
      res.off('close', abort);
    }
  }
}

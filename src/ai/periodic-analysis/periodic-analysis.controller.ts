import {
  ConflictException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/strategies/JwtAuthGuard';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { PlanGuard, AiCreditCycleId } from '../guards/plan.guard';
import { PeriodicAnalysisService } from './periodic-analysis.service';
import {
  AnalysisDialogDto,
  PeriodicAnalysisDto,
} from './periodic-analysis.dto';
@Controller('ai/periodic-analyses')
@UseGuards(JwtAuthGuard)
export class PeriodicAnalysisController {
  constructor(private readonly service: PeriodicAnalysisService) {}
  @Get() list(
    @ActiveUserData() user: ActiveUserDataT,
    @Query('end') end: string,
  ) {
    return this.service.list(user.id, end);
  }
  @Get(':id') get(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(user.id, id);
  }
  @Post('estimate')
  @UseGuards(PlanGuard)
  estimate(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PeriodicAnalysisDto,
  ) {
    return this.service.estimate(user.id, dto);
  }
  @Post()
  @AiCreditCycleId('requestId')
  @UseGuards(PlanGuard)
  generate(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PeriodicAnalysisDto,
  ) {
    return this.service.generate(user.id, dto);
  }
  @Post(':id/dialog')
  @AiCreditCycleId('requestId')
  @UseGuards(PlanGuard)
  dialog(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnalysisDialogDto,
  ) {
    if (dto.expectedUserId !== user.id)
      throw new ConflictException('Analysis account changed');
    return this.service.dialog(
      user.id,
      id,
      dto.requestId,
      dto.question.trim(),
      undefined,
      dto.createdAt,
      dto.report,
      dto.activeCommitments,
      dto.mediaIds,
      dto.imageGenerationSupported === true,
    );
  }

  @Post('capsule/week')
  @AiCreditCycleId('requestId')
  @UseGuards(PlanGuard)
  regenerateWeeklyCapsule(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PeriodicAnalysisDto,
  ) {
    return this.service.regenerateWeeklyCapsule(user.id, dto);
  }

  @Post('capsule/month-fragment')
  @AiCreditCycleId('requestId')
  @UseGuards(PlanGuard)
  compressMonthFragment(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PeriodicAnalysisDto,
  ) {
    return this.service.compressMonthFragment(user.id, dto);
  }
  @Post('context-capacity')
  @UseGuards(PlanGuard)
  contextCapacity(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PeriodicAnalysisDto,
  ) {
    return this.service.contextCapacity(user.id, dto);
  }

  @Post('capsule/recover')
  @AiCreditCycleId('requestId')
  @UseGuards(PlanGuard)
  recoverCapsule(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PeriodicAnalysisDto,
  ) {
    return this.service.recoverCapsule(user.id, dto);
  }
}

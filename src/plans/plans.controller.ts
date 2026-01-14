import { Body, Controller, Post, UseGuards, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto';
import { PlanStatus } from './types';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('subscribe')
  async subscribePlan(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() createPlanDto: CreatePlanDto,
  ) {
    return await this.plansService.subscribePlan(user.id, createPlanDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('unsubscribe')
  async unsubscribePlan(@ActiveUserData() user: ActiveUserDataT) {
    return await this.plansService.unsubscribePlan(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('get-actual')
  async getActualPlan(@ActiveUserData() user: ActiveUserDataT) {
    return await this.plansService.getActualByUserId(user.id);
  }

  @UseGuards(AuthGuard('admin-jwt'))
  @Post('change-plan-status')
  async changePlanStatus(@Body() body: { id: number; planStatus: PlanStatus }) {
    return await this.plansService.changePlanStatus(body.id, body.planStatus);
  }
}

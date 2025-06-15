import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto';

@UseGuards(AuthGuard('jwt'))
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post('subscribe')
  async subscribePlan(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() createPlanDto: CreatePlanDto,
  ) {
    return await this.plansService.subscribePlan(user.id, createPlanDto);
  }
}

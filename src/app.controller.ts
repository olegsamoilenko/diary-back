import { Controller, Get, Header } from '@nestjs/common';
import { buildOnboardingConfig } from './common/onboarding-config';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('is-show-welcome-tooltip')
  isShowWelcomeTooltip(): boolean {
    return false;
  }

  // Public: the name screen can precede authentication. No user data returned.
  @Get('onboarding/config')
  @Header('Cache-Control', 'no-store')
  onboardingConfig() {
    return buildOnboardingConfig();
  }
}

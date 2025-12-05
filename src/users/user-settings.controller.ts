import { Controller, Get } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';

@Controller('user-settings')
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get('theme-statistics')
  async getThemeStatistics() {
    return await this.userSettingsService.getThemeStatistics();
  }

  @Get('font-statistics')
  async getFontStatistics() {
    return await this.userSettingsService.getFontStatistics();
  }

  @Get('app-build-statistics')
  async getAppBuildStatistics() {
    return await this.userSettingsService.getAppBuildStatistics();
  }

  @Get('ai-model-statistics')
  async getAiModelStatistics() {
    return await this.userSettingsService.getAiModelStatistics();
  }

  @Get('locale-statistics')
  async getLocaleStatistics() {
    return await this.userSettingsService.getLocaleStatistics();
  }
}

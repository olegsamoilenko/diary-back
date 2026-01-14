import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiPreferencesService } from './ai-preferences.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import type { AiPreferences } from './types';

@Controller('ai-preferences')
export class AiPreferencesController {
  constructor(private readonly aiPreferencesService: AiPreferencesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('update')
  async patchForUser(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: { patch: Partial<AiPreferences>; baseRowVersion?: number },
  ) {
    if (!user) return null;
    return await this.aiPreferencesService.patchForUser(
      user.id,
      body.patch,
      body.baseRowVersion,
    );
  }
}

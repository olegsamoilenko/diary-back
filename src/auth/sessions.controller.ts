import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDeviceKeyDto } from './dto/register-devicekey.dto';
import { Request } from 'express';
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;

    return this.sessionsService.refresh(
      dto.userId,
      dto.deviceId,
      dto.refreshToken,
      dto.ts,
      dto.sig,
      ua,
      ip,
    );
  }

  @Post('recover-anon')
  @HttpCode(200)
  async recoverAnon(
    @Body()
    body: {
      userId: number;
      uuid: string;
      hash: string;
      deviceId: string;
      ts: number;
      sig: string;
      devicePubKey?: string | null;
    },
    @Req() req: Request,
  ) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;

    return await this.sessionsService.recoverAnon(
      Number(body.userId),
      body.uuid,
      body.hash,
      body.deviceId,
      Number(body.ts),
      body.sig,
      body.devicePubKey ?? null,
      ua,
      ip,
    );
  }

  // @Post('register-key')
  // async registerKey(@Body() dto: RegisterDeviceKeyDto) {
  //   return await this.sessionsService.registerDeviceKey(
  //     dto.userId,
  //     dto.deviceId,
  //     dto.devicePubKey,
  //   );
  // }
}

import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDTO,
  RegisterDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
} from './dto';
import { seconds, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CustomThrottlerGuard } from 'src/common/guards/custom-throttler.guard';

@UseGuards(CustomThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registration')
  async register(@Body() registerDto: RegisterDTO) {
    return await this.authService.register(registerDto);
  }

  @Post('confirm-email')
  async emailConfirmation(
    @Body()
    body: {
      email: string;
      code: string;
      type?: 'register_email' | 'email_change';
      deviceId: string;
      devicePubKey: string;
    },
    @Req() req: Request,
  ) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;
    return await this.authService.emailConfirmation(
      body.email,
      body.code,
      body.type,
      body.deviceId,
      body.devicePubKey,
      ua,
      ip,
    );
  }

  @Post('resend-code')
  async resendCode(
    @Body()
    data: {
      email: string;
      lang: string;
      type?: 'register' | 'newEmail';
    },
  ) {
    return await this.authService.resendCode(data.email, data.lang, data.type);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDTO, @Req() req: Request) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;
    return await this.authService.login(loginDto, ua, ip);
  }

  @Post('create-token')
  async createToken(@Body() data: { uuid: string; hash: string }) {
    return await this.authService.createToken(data.uuid, data.hash);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async resetPassword(@Body() resetPasswordDTO: ResetPasswordDTO) {
    return await this.authService.resetPassword(resetPasswordDTO);
  }

  @Post('change-password')
  async changePassword(@Body() changePasswordDto: ChangePasswordDTO) {
    return await this.authService.changePassword(changePasswordDto);
  }

  @Post('sign-in-with-google')
  async signInWithGoogle(
    @Body()
    data: {
      userId: number;
      uuid: string;
      idToken: string;
      deviceId: string;
      devicePubKey: string;
    },
    @Req() req: Request,
  ) {
    const ip = req.clientIp ?? null;
    const ua = req.clientUa ?? null;
    return await this.authService.signInWithGoogle(
      data.userId,
      data.uuid,
      data.idToken,
      data.deviceId,
      data.devicePubKey,
      ua,
      ip,
    );
  }

  // @Post('sign-in-with-phone/:id')
  // async signInWithPhone(
  //   @Param('id') id: number,
  //   @Body() data: { phone: string },
  // ) {
  //   return await this.authService.signInWithPhone(id, data.phone);
  // }
  //
  // @Post('verify-phone')
  // async verifyPhone(@Body() data: { phone: string; code: string }) {
  //   return await this.authService.verifyPhone(data.code);
  // }

  // @Post('logout')
  // async logout() {
  //   return await this.authService.logout();
  // }
}

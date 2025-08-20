import { Body, Controller, Param, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDTO,
  RegisterDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registration')
  async register(@Body() registerDto: RegisterDTO) {
    return await this.authService.register(registerDto);
  }

  @Post('confirm-email')
  async emailConfirmation(@Body() emailConfirmationDto: { code: string }) {
    return await this.authService.emailConfirmation(emailConfirmationDto.code);
  }

  @Post('new-email-confirm')
  async newEmailConfirmation(@Body() emailConfirmationDto: { code: string }) {
    return await this.authService.newEmailConfirmation(
      emailConfirmationDto.code,
    );
  }

  @Post('resend-code')
  async resendCode(
    @Body()
    data: {
      lang: string;
      email: string;
      type?: 'register' | 'newEmail';
    },
  ) {
    return await this.authService.resendCode(data.email, data.lang, data.type);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDTO) {
    return await this.authService.login(loginDto);
  }

  @Post('create-token')
  async createToken(@Body() data: { uuid: string; hash: string }) {
    return await this.authService.createToken(data.uuid, data.hash);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDTO: ResetPasswordDTO) {
    return await this.authService.resetPassword(resetPasswordDTO);
  }

  @Post('change-password')
  async changePassword(@Body() changePasswordDto: ChangePasswordDTO) {
    return await this.authService.changePassword(changePasswordDto);
  }

  @Post('sign-in-with-google')
  async signInWithGoogle(
    @Body() data: { userId: number; uuid: string; idToken: string },
  ) {
    return await this.authService.signInWithGoogle(
      data.userId,
      data.uuid,
      data.idToken,
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

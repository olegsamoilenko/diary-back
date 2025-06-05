import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO, RegisterDTO, ResetPasswordDTO } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registration')
  async register(@Body() registerDto: RegisterDTO) {
    return await this.authService.register(registerDto);
  }

  @Post('confirm-email')
  async emailConfirmation(@Body() emailConfirmationDto: { token: string }) {
    return await this.authService.emailConfirmation(emailConfirmationDto.token);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDTO) {
    return await this.authService.login(loginDto);
  }

  @Post('create-token')
  async createToken(@Body() data: { uuid: string }) {
    return await this.authService.loginByUUID(data.uuid);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDTO: ResetPasswordDTO) {
    return await this.authService.resetPassword(resetPasswordDTO);
  }

  // @Post('logout')
  // async logout() {
  //   return await this.authService.logout();
  // }
}

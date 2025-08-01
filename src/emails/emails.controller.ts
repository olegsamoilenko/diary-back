import { Controller, Post, Body } from '@nestjs/common';
import { EmailsService } from './emails.service';

@Controller('emails')
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('send-test')
  async sendTestEmail(
    @Body() body: { to: string; subject: string; template: string },
  ) {
    await this.emailsService.send([body.to], body.subject, body.template);
    return { message: 'Email sent (or error thrown)' };
  }
}

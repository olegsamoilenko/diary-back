import { Injectable } from '@nestjs/common';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';

type MailgunClient = ReturnType<Mailgun['client']>;

@Injectable()
export class EmailsService {
  private mg: MailgunClient;
  private templateCache = new Map<string, handlebars.TemplateDelegate>();
  constructor() {
    this.mg = new Mailgun(FormData).client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY!,
    });
  }

  async send(to: string[], subject: string, template: string, context?: any) {
    const domain = process.env.MAILGUN_DOMAIN!;
    const from = process.env.MAILGUN_FROM_EMAIL!;
    const compiled = this.loadTemplate(`${template}.hbs`);
    const html = compiled(context);

    try {
      const result = await this.mg.messages.create(domain, {
        to,
        subject,
        from: `Nemory <${from}>`,
        html,
      });

      return result;
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }
      throwError(HttpStatus.BAD_REQUEST, message, message, 'EMAIL_SEND_FAILED');
    }
  }

  private loadTemplate(templateName: string): handlebars.TemplateDelegate {
    const cached = this.templateCache.get(templateName);
    if (cached) return cached;
    const templatesFolderPath = process.cwd() + '/src/emails/templates';
    const templatePath = path.join(templatesFolderPath, templateName);
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const compiled = handlebars.compile(templateSource);
    this.templateCache.set(templateName, compiled);
    return compiled;
  }
}

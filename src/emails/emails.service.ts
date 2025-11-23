import { Injectable } from '@nestjs/common';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
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

    const templatesDir = join(__dirname, 'templates');
    const full = join(templatesDir, templateName);

    if (!fs.existsSync(full)) {
      console.error(
        '[Emails] template not found:',
        full,
        'cwd=',
        process.cwd(),
        '__dirname=',
        __dirname,
      );
      throw new Error(`Email template not found: ${full}`);
    }

    const src = fs.readFileSync(full, 'utf8');
    const compiled = handlebars.compile(src);
    this.templateCache.set(templateName, compiled);
    return compiled;
  }
}

import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { SendMailOptions } from 'nodemailer';

@Injectable()
export class EmailsService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport(
      {
        host: process.env.SEND_GRID_SERVER,
        port: Number(process.env.SEND_GRID_PORT),
        secure: false,
        auth: {
          user: process.env.SEND_GRID_USERNAME,
          pass: process.env.SEND_GRID_PASSWORD,
        },
        // tls: {
        //   ciphers: 'SSLv3'
        // }
      },
      {
        from: 'Nemory <info@nemory.com>',
      },
    ) as nodemailer.Transporter;
  }

  async send(
    to: string[],
    subject: string,
    template: string,
    context?: any,
    headers?: SendMailOptions['headers'],
  ) {
    const html = this.loadTemplate(`${template}.hbs`)(context);

    try {
      await this.transporter.sendMail({
        to,
        subject,
        from: 'Nemory <info@nemory.com>',
        html,
        headers,
      });
      console.log('Email sent successfully');
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }
      throw new Error(message);
    }
  }

  private loadTemplate(templateName: string): handlebars.TemplateDelegate {
    const templatesFolderPath = process.cwd() + '/src/emails/templates';
    const templatePath = path.join(templatesFolderPath, templateName);
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    return handlebars.compile(templateSource);
  }
}

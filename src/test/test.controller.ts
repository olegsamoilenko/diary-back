import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { BlockedCountriesGuard } from '../common/geo-access/blocked-countries.guard';
// @UseGuards(AuthGuard('jwt'))
@Controller('test')
export class TestController {
  @Get('test')
  getTest(): string {
    return 'Test endpoint is working!';
  }

  @Get('headers')
  getHeaders(@Req() req: Request, @Res() res: Response) {
    const data = {
      headers: req.headers,
    };

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Request Headers</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              background: #0f1115;
              color: #e8e8e8;
            }
            h1 {
              margin-bottom: 16px;
              font-size: 24px;
            }
            pre {
              background: #171a21;
              padding: 16px;
              border-radius: 12px;
              overflow: auto;
              white-space: pre-wrap;
              word-break: break-word;
              border: 1px solid #2a2f3a;
              line-height: 1.5;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <h1>Request headers</h1>
          <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
        </body>
      </html>
    `);
  }

  @Post('test-block-countries')
  @UseGuards(BlockedCountriesGuard)
  testBlockCountries(): string {
    return 'Test block countries is not working!';
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

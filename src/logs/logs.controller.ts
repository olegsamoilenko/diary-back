import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogBatchDto } from './dto/log-batch.dto';
import type { Request } from 'express';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { LogsLevel } from './types';

@Controller('logs')
export class LogsController {
  constructor(private readonly svc: LogsService) {}

  @Post()
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  )
  async ingest(
    @Body() body: LogBatchDto,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
    @Headers('x-request-id') reqId: string | undefined,
    @Req() req: Request,
  ) {
    const requestId = reqId && isUuid(reqId) ? reqId : uuidv4();

    const res = await this.svc.ingestBatch(body, {
      ip: ip ?? (req.headers['x-forwarded-for'] as string) ?? null,
      ua: ua ?? null,
      requestId,
    });

    return { ok: true, requestId, ...res };
  }

  @Get('get-logs')
  async getLogs(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('level') level: LogsLevel,
    @Query('userId') userId?: number,
    @Query('userUuid') userUuid?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 50;
    return await this.svc.getLogs(
      startDate,
      endDate,
      level,
      userId ? Number(userId) : undefined,
      userUuid === 'undefined' || userUuid === '' ? undefined : userUuid,
      p,
      l,
    );
  }

  @Get('get-server-logs')
  async getServerLogs(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('level') level: LogsLevel,
    @Query('userId') userId?: number,
    @Query('userUuid') userUuid?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 50;
    return await this.svc.getServerLogs(
      startDate,
      endDate,
      level,
      userId ? Number(userId) : undefined,
      userUuid === 'undefined' || userUuid === '' ? undefined : userUuid,
      p,
      l,
    );
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Log } from './entities/log.entity';
import { LogBatchDto } from './dto/log-batch.dto';
import { LogEventDto } from './dto/log-event.dto';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { LogsLevel } from './types';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(Log)
    private readonly repo: Repository<Log>,
  ) {}

  async ingestBatch(
    batch: LogBatchDto,
    meta: { ip?: string | null; ua?: string | null; requestId?: string | null },
  ): Promise<{ inserted: number }> {
    const rows = batch.events.map((e: LogEventDto) => {
      const ts = new Date(Number(e.ts || Date.now()));
      const userId =
        e.userId === null || e.userId === undefined
          ? null
          : Number.isFinite(Number(e.userId))
            ? Number(e.userId)
            : null;

      const userUuid =
        e.userUuid === null || e.userUuid === undefined ? null : e.userUuid;

      const requestId =
        e.requestId && isUuid(e.requestId)
          ? e.requestId
          : (meta.requestId ?? null);

      return {
        ts,
        level: e.level,
        source: e.source ?? 'frontend',
        kind: e.kind,
        name: e.name,
        userId,
        userUuid,
        appData: (e.appData ?? null) as Log['appData'],
        // eslint-disable @typescript-eslint/no-unsafe-assignment
        device: (e.device ?? null) as Log['device'],
        data: (e.data ?? null) as Log['data'],
        requestId,
        ip: meta.ip ?? null,
        ua: meta.ua ?? null,
      };
    });

    if (rows.length === 0) return { inserted: 0 };

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Log)
      .values(rows as unknown as QueryDeepPartialEntity<Log>[])
      .execute();

    return { inserted: rows.length };
  }

  async getLogs(
    startDate?: string,
    endDate?: string,
    level?: LogsLevel,
    userId?: number,
    userUuid?: string,
    page = 1,
    limit = 50,
  ): Promise<{
    logs: Log[];
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const endPlus1 = dayjs(endDate).add(1, 'day').format('YYYY-MM-DD');
    const qb = this.repo.createQueryBuilder('l');

    const TZ = 'Europe/Kyiv';
    const isDateOnly = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

    if (isDateOnly(startDate) || isDateOnly(endDate)) {
      if (startDate && endDate) {
        qb.andWhere(`(l.ts AT TIME ZONE :tz)::date BETWEEN :sd AND :ed`, {
          tz: TZ,
          sd: startDate,
          ed: endDate,
        });
      } else if (startDate) {
        qb.andWhere(`(l.ts AT TIME ZONE :tz)::date >= :sd`, {
          tz: TZ,
          sd: startDate,
        });
      } else if (endDate) {
        qb.andWhere(`(l.ts AT TIME ZONE :tz)::date <= :ed`, {
          tz: TZ,
          ed: endDate,
        });
      }
    } else {
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) qb.andWhere('l.ts >= :start', { start });
      }
      if (endDate) {
        const end = new Date(endPlus1);
        if (!isNaN(end.getTime())) qb.andWhere('l.ts < :end', { end });
      }
    }

    if (
      level === LogsLevel.INFO ||
      level === LogsLevel.WARN ||
      level === LogsLevel.ERROR
    )
      qb.andWhere('l.level = :level', { level });

    if (level === LogsLevel.WARN_ERROR) {
      qb.andWhere('l.level IN (:...levels)', {
        levels: [LogsLevel.ERROR, LogsLevel.WARN],
      });
    }

    if (typeof userId === 'number' && userId > 0)
      qb.andWhere('l.userId = :userId', { userId });

    if (userUuid) qb.andWhere('l.userUuid = :userUuid', { userUuid });

    const safeLimit = Math.min(Math.max(limit ?? 50, 1), 200);
    const safePage = Math.max(page ?? 1, 1);

    const [logs, total] = await qb
      .orderBy('l.ts', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .take(safeLimit)
      .skip((safePage - 1) * safeLimit)
      .getManyAndCount();

    return {
      logs,
      total,
      page: safePage,
      pageCount: Math.max(1, Math.ceil(total / safeLimit)),
      limit: safeLimit,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaptureAiResponseMonitoringDto } from './dto/capture-ai-response-monitoring.dto';
import { AiResponseMonitoringRecord } from './entities/ai-response-monitoring-record.entity';
import { AiResponseMonitoringMode } from './types/ai-response-monitoring-mode';

@Injectable()
export class AiResponseMonitoringService {
  private sampleCounter = 0;

  constructor(
    @InjectRepository(AiResponseMonitoringRecord)
    private readonly recordsRepository: Repository<AiResponseMonitoringRecord>,
    private readonly configService: ConfigService,
  ) {}

  async capture(dto: CaptureAiResponseMonitoringDto): Promise<boolean> {
    if (!this.shouldCapture()) return false;

    const record = this.recordsRepository.create({
      mode: dto.mode,
      aiModel: dto.aiModel,
      mood: dto.mood ?? null,
      metricsJson: dto.metrics ?? null,
      entryText: dto.entryText,
      responseText: dto.responseText,
      fullResponseText: dto.fullResponseText ?? null,
      shortResponseText: dto.shortResponseText ?? null,
      tagsJson: dto.tags ?? null,
    });

    await this.recordsRepository.save(record);
    return true;
  }

  async captureSafely(dto: CaptureAiResponseMonitoringDto): Promise<void> {
    try {
      await this.capture(dto);
    } catch (err) {
      console.error('Failed to capture AI response monitoring record:', err);
    }
  }

  async getRecords(params: {
    page?: number;
    limit?: number;
    mode?: AiResponseMonitoringMode;
    isRead?: boolean;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 50), 200);

    const qb = this.recordsRepository
      .createQueryBuilder('record')
      .orderBy('record.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (params.mode) {
      qb.andWhere('record.mode = :mode', { mode: params.mode });
    }

    if (typeof params.isRead === 'boolean') {
      qb.andWhere('record.isRead = :isRead', { isRead: params.isRead });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async markAsRead(id: number): Promise<boolean> {
    const result = await this.recordsRepository.update(
      { id },
      { isRead: true },
    );
    return Boolean(result.affected);
  }

  async deleteRecord(id: number): Promise<boolean> {
    const result = await this.recordsRepository.delete({ id });
    return Boolean(result.affected);
  }

  private shouldCapture(): boolean {
    const enabled = this.configService.get<string>(
      'AI_RESPONSE_MONITORING_ENABLED',
    );

    if (enabled === 'false' || enabled === '0') return false;

    const sampleRateRaw =
      this.configService.get<string>('AI_RESPONSE_MONITORING_SAMPLE_RATE') ??
      this.configService.get<string>('AI_RESPONSE_MONITORING_EVERY_N');
    const sampleRate = Math.max(1, Number(sampleRateRaw) || 1);

    if (sampleRate <= 1) return true;

    this.sampleCounter = (this.sampleCounter % sampleRate) + 1;
    return this.sampleCounter === sampleRate;
  }
}

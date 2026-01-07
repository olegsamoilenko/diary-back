import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PlanStatisticsService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async getTokenStatistics(page = 1, limit = 20) {
    const p = Math.max(page ?? 1, 1);
    const l = Math.min(Math.max(limit ?? 20, 1), 200);
    const skip = (p - 1) * l;

    const qb = this.planRepository
      .createQueryBuilder('plan')
      .innerJoinAndSelect('plan.user', 'user')
      .where('plan.actual = :actual', { actual: true })
      .orderBy('plan.id', 'ASC')
      .skip(skip)
      .take(l);

    const [rows, total] = await qb.getManyAndCount();

    const creditsStatistics = rows.map((r) => ({
      userName: r.user.name,
      userEmail: r.user.email,
      userUuid: r.user.uuid,
      basePlanId: r.basePlanId,
      inputUsedCredits: Number(r.inputUsedCredits) || 0,
      outputUsedCredits: Number(r.outputUsedCredits) || 0,
    }));

    return {
      creditsStatistics,
      meta: {
        page: p,
        limit: l,
        total,
        pageCount: Math.max(1, Math.ceil(total / l)),
      },
    };
  }
}

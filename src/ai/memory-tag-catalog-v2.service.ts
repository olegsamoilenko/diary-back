import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MemoryTagCatalogV2Entity } from './entities/memory-tag-catalog-v2.entity';
import { MEMORY_TAG_CATALOG_V2_SEED } from './seeds/memory-tag-catalog-v2.seed';
import type {
  GroupedMemoryTagCatalogV2,
  MemoryTagCatalogPromptItemV2,
} from './types/memoryTagCatalogV2';

@Injectable()
export class MemoryTagCatalogV2Service implements OnApplicationBootstrap {
  private readonly logger = new Logger(MemoryTagCatalogV2Service.name);

  constructor(
    @InjectRepository(MemoryTagCatalogV2Entity)
    private readonly repo: Repository<MemoryTagCatalogV2Entity>,
  ) {}

  async onApplicationBootstrap() {
    await this.repo.upsert(
      MEMORY_TAG_CATALOG_V2_SEED.map((tag) => ({
        key: tag.key,
        type: tag.type,
        label: tag.label,
        description: tag.description,
        aliases: tag.aliases ?? [],
        source: 'seed' as const,
        status: 'active' as const,
        canonicalKey: null,
      })),
      { conflictPaths: ['key'], skipUpdateIfNoValuesChanged: true },
    );
    this.logger.log(
      `Memory tag catalog V2 ready: ${MEMORY_TAG_CATALOG_V2_SEED.length} seeded tags`,
    );
  }

  async getGroupedCatalog(): Promise<GroupedMemoryTagCatalogV2> {
    const rows = await this.repo.find({
      where: { status: 'active' },
      order: { type: 'ASC', usageCount: 'DESC', key: 'ASC' },
    });
    const grouped: GroupedMemoryTagCatalogV2 = {
      domains: [],
      states: [],
      mechanisms: [],
      knownEntities: [],
      knownThreads: [],
    };
    for (const row of rows) {
      const item: MemoryTagCatalogPromptItemV2 = {
        key: row.key,
        label: row.label,
        description: row.description,
        ...(row.aliases.length ? { aliases: row.aliases } : {}),
      };
      if (row.type === 'domain') grouped.domains.push(item);
      else if (row.type === 'state') grouped.states.push(item);
      else if (row.type === 'mechanism') grouped.mechanisms.push(item);
      else if (row.type === 'entity') grouped.knownEntities.push(item);
      else grouped.knownThreads.push(item);
    }
    return grouped;
  }

  async markUsed(keys: string[]) {
    const unique = [...new Set(keys)].filter(Boolean);
    if (!unique.length) return;
    const existing = await this.repo.find({
      select: { key: true },
      where: { key: In(unique), status: 'active' },
    });
    if (!existing.length) return;
    await this.repo
      .createQueryBuilder()
      .update(MemoryTagCatalogV2Entity)
      .set({
        usageCount: () => 'usage_count + 1',
        lastUsedAt: new Date(),
      })
      .where({ key: In(existing.map((item) => item.key)) })
      .execute();
  }
}

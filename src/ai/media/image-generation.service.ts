import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { CryptoService } from 'src/kms/crypto.service';
import { AiMediaAsset } from './media-asset.entity';
import {
  IMAGE_GENERATION_MODEL,
  imageGenerationQuote,
  imagePrompt,
} from './image-generation.policy';
import type { PreparedImage, PreparedMedia } from './media-processor';
import { isUUID } from 'class-validator';

export type GeneratedImageUsage = {
  inputTokens: number;
  outputTokens: number;
  imageInputTokens?: number;
};
type GeneratedPayload = { imageBase64?: string; usage?: GeneratedImageUsage };
export type ImageGenerationRequest = {
  userId: number;
  imageGeneration: { id: string; prompt: string; referenceIds?: string[] };
};

/** Reuses encrypted media storage. A durable claim prevents paid retries across processes/restarts. */
@Injectable()
export class ImageGenerationService {
  constructor(
    @InjectRepository(AiMediaAsset)
    private readonly assets: Repository<AiMediaAsset>,
    private readonly crypto: CryptoService,
  ) {}

  private referenceIds(ids: string[] | undefined): string[] {
    if (ids === undefined) return [];
    if (
      !Array.isArray(ids) ||
      ids.length > 16 ||
      ids.some((id) => typeof id !== 'string' || !isUUID(id)) ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException('INVALID_IMAGE_REFERENCES');
    return ids;
  }

  private async references(
    userId: number,
    ids: string[],
  ): Promise<(PreparedImage & { id: string })[]> {
    return Promise.all(
      ids.map(async (id) => {
        const row = await this.assets.findOneBy({ userId, id });
        if (!row) throw new NotFoundException('IMAGE_REFERENCE_NOT_FOUND');
        if (
          row.metadata.kind !== 'image' ||
          !['prepared', 'ready'].includes(row.status) ||
          row.hash.startsWith('generation:')
        )
          throw new BadRequestException('IMAGE_REFERENCE_UNAVAILABLE');
        const payload = JSON.parse(
          (
            await this.crypto.decryptForUser(userId, row.encryptedPayload)
          ).toString('utf8'),
        ) as PreparedMedia;
        const image = payload.images?.[0];
        if (
          payload.images?.length !== 1 ||
          !image?.base64 ||
          !(image.width > 0) ||
          !(image.height > 0)
        )
          throw new BadRequestException('IMAGE_REFERENCE_UNAVAILABLE');
        return { ...image, id };
      }),
    );
  }

  async quote(userId: number, prompt: string, referenceIds?: string[]) {
    imageGenerationQuote(prompt); // Reject disabled capability before reading media.
    const references = await this.references(
      userId,
      this.referenceIds(referenceIds),
    );
    // Planning allowance for prepared images, not a provider token measurement.
    const imageTokens = references.reduce(
      (sum, image) =>
        sum + Math.ceil(image.width / 32) * Math.ceil(image.height / 32) + 256,
      0,
    );
    return {
      ...imageGenerationQuote(prompt, imageTokens),
      ...(references.length
        ? {
            references: references.map((image) => ({
              id: image.id,
              uri: `data:image/jpeg;base64,${image.base64}`,
              width: image.width,
              height: image.height,
            })),
          }
        : {}),
    };
  }

  private async decode(row: AiMediaAsset): Promise<GeneratedPayload> {
    return JSON.parse(
      (
        await this.crypto.decryptForUser(row.userId, row.encryptedPayload)
      ).toString('utf8'),
    ) as GeneratedPayload;
  }

  async result(userId: number, id: string) {
    const row = await this.assets.findOneBy({ userId, id });
    // This endpoint is also the pre-generation existence probe. Missing or
    // inaccessible results are normal absence, not an AI server failure.
    if (!row || !row.hash.startsWith('generation:')) return null;
    if (row.status !== 'generated')
      return {
        id,
        status:
          row.status === 'generating' &&
          row.createdAt &&
          Date.now() - row.createdAt.getTime() > 5 * 60_000
            ? 'generation_failed'
            : row.status,
      };
    const payload = await this.decode(row);
    return {
      id,
      status: row.status,
      imageBase64: payload.imageBase64,
      mimeType: 'image/jpeg',
      width: 1024,
      height: 1024,
    };
  }

  async generate(
    request: ImageGenerationRequest,
    callbacks: {
      generate: (
        prompt: string,
        references?: PreparedImage[],
      ) => Promise<{ imageBase64: string; usage: GeneratedImageUsage }>;
      charge: (usage: GeneratedImageUsage) => Promise<void>;
    },
  ) {
    const {
      userId,
      imageGeneration: { id },
    } = request;
    const prompt = imagePrompt(request.imageGeneration.prompt);
    const referenceIds = this.referenceIds(
      request.imageGeneration.referenceIds,
    );
    const hash =
      'generation:' +
      createHash('sha256')
        .update(IMAGE_GENERATION_MODEL)
        .update(prompt)
        .update(referenceIds.length ? JSON.stringify(referenceIds) : '')
        .digest('hex');
    const existing = await this.assets.findOneBy({ id });
    if (existing) {
      if (existing.userId !== userId) throw new NotFoundException();
      if (existing.hash !== hash)
        throw new ConflictException('IMAGE_REQUEST_REUSED');
      return this.result(userId, id);
    }
    imageGenerationQuote(prompt); // Server capability check before claiming or spending.
    const references = await this.references(userId, referenceIds);
    const row = this.assets.create({
      id,
      userId,
      hash,
      status: 'generating',
      metadata: { kind: 'image', width: 1024, height: 1024 },
      usedAt: new Date(),
      encryptedPayload: await this.crypto.encryptForUser(
        userId,
        'ai_media',
        JSON.stringify({}),
      ),
    });
    try {
      await this.assets.insert({
        id: row.id,
        userId: row.userId,
        hash: row.hash,
        status: row.status,
        metadata: row.metadata,
        usedAt: row.usedAt,
        encryptedPayload: row.encryptedPayload,
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('IMAGE_GENERATION_IN_PROGRESS');
      throw error;
    }
    try {
      const generated = await callbacks.generate(prompt, references);
      row.encryptedPayload = await this.crypto.encryptForUser(
        userId,
        'ai_media',
        JSON.stringify(generated),
      );
      // Never rerun provider work or uncertain billing automatically.
      row.status = 'generation_billing_pending';
      await this.assets.save(row);
      await callbacks.charge(generated.usage);
      row.status = 'generated';
      await this.assets.save(row);
      return this.result(userId, id);
    } catch (error) {
      if (row.status === 'generating')
        await this.assets.update(
          { id, userId },
          { status: 'generation_failed' },
        );
      throw error;
    }
  }
}

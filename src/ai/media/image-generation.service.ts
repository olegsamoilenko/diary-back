import {
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

export type GeneratedImageUsage = { inputTokens: number; outputTokens: number };
type GeneratedPayload = { imageBase64?: string; usage?: GeneratedImageUsage };
export type ImageGenerationRequest = {
  userId: number;
  imageGeneration: { id: string; prompt: string };
};

/** Reuses encrypted media storage. A durable claim prevents paid retries across processes/restarts. */
@Injectable()
export class ImageGenerationService {
  constructor(
    @InjectRepository(AiMediaAsset)
    private readonly assets: Repository<AiMediaAsset>,
    private readonly crypto: CryptoService,
  ) {}

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
      ) => Promise<{ imageBase64: string; usage: GeneratedImageUsage }>;
      charge: (usage: GeneratedImageUsage) => Promise<void>;
    },
  ) {
    const {
      userId,
      imageGeneration: { id },
    } = request;
    const prompt = imagePrompt(request.imageGeneration.prompt);
    const hash =
      'generation:' +
      createHash('sha256')
        .update(IMAGE_GENERATION_MODEL)
        .update(prompt)
        .digest('hex');
    const existing = await this.assets.findOneBy({ id });
    if (existing) {
      if (existing.userId !== userId) throw new NotFoundException();
      if (existing.hash !== hash)
        throw new ConflictException('IMAGE_REQUEST_REUSED');
      return this.result(userId, id);
    }
    imageGenerationQuote(prompt); // Server capability check before claiming or spending.
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
      const generated = await callbacks.generate(prompt);
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

import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAiEmbeddingProvider {
  private readonly openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  async create(params: { model: string; inputs: string[] }) {
    const response = await this.openai.embeddings.create({
      model: params.model,
      input: params.inputs,
    });

    return {
      vectors: [...response.data]
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding),
      providerTokens: response.usage?.total_tokens ?? null,
    };
  }
}

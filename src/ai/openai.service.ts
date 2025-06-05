import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async getEmbedding(text: string): Promise<number[]> {
    const resp = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return resp.data[0].embedding;
  }
}

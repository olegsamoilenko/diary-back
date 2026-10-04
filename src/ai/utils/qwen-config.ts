import { ServiceUnavailableException } from '@nestjs/common';
import type { ClientOptions } from 'openai';

/** Qwen is connected through the Singapore International deployment. */
export function getQwenClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): ClientOptions {
  const apiKey = env.DASHSCOPE_API_KEY?.trim();
  const baseURL = env.QWEN_BASE_URL?.trim().replace(/\/$/, '');
  const model = env.QWEN_MODEL?.trim() || 'qwen3.8-max';
  if (!apiKey || !baseURL) {
    throw new ServiceUnavailableException(
      'Qwen is not configured. Set DASHSCOPE_API_KEY and QWEN_BASE_URL on the server.',
    );
  }
  if (
    !/^https:\/\/[a-z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com\/compatible-mode\/v1$/.test(
      baseURL,
    ) ||
    model !== 'qwen3.8-max'
  ) {
    throw new ServiceUnavailableException(
      'Qwen requires a Singapore OpenAI-compatible endpoint and QWEN_MODEL=qwen3.8-max.',
    );
  }
  return { apiKey, baseURL, timeout: 60_000, maxRetries: 0 };
}

import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { getModelById } from './models';

const deepseek = createOpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

const xai = createOpenAI({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.XAI_API_KEY ?? '',
});

export function getProvider(modelId: string) {
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  switch (model.provider) {
    case 'anthropic':
      return anthropic(modelId);
    case 'openai':
      return openai(modelId);
    case 'google':
      return google(modelId);
    case 'deepseek':
      return deepseek(modelId);
    case 'xai':
      return xai(modelId);
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }
}

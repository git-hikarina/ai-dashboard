export interface ModelInfo {
  id: string;
  provider: 'anthropic' | 'openai' | 'google' | 'deepseek' | 'xai';
  displayName: string;
  tier: 'light' | 'standard' | 'heavy';
  inputPricePer1k: number;
  outputPricePer1k: number;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
}

export const MODELS: ModelInfo[] = [
  // Anthropic
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus',
    tier: 'heavy',
    inputPricePer1k: 2.25,
    outputPricePer1k: 11.25,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet',
    tier: 'standard',
    inputPricePer1k: 0.45,
    outputPricePer1k: 2.25,
    maxTokens: 64000,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'claude-haiku-4-5-20251213',
    provider: 'anthropic',
    displayName: 'Claude Haiku',
    tier: 'light',
    inputPricePer1k: 0.038,
    outputPricePer1k: 0.188,
    maxTokens: 64000,
    supportsStreaming: true,
    supportsVision: true,
  },
  // OpenAI
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    tier: 'standard',
    inputPricePer1k: 0.375,
    outputPricePer1k: 1.5,
    maxTokens: 16384,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o mini',
    tier: 'light',
    inputPricePer1k: 0.011,
    outputPricePer1k: 0.045,
    maxTokens: 16384,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'o1',
    provider: 'openai',
    displayName: 'o1',
    tier: 'heavy',
    inputPricePer1k: 2.25,
    outputPricePer1k: 9.0,
    maxTokens: 100000,
    supportsStreaming: true,
    supportsVision: true,
  },
  // Google
  {
    id: 'gemini-2.0-pro',
    provider: 'google',
    displayName: 'Gemini Pro',
    tier: 'standard',
    inputPricePer1k: 0.188,
    outputPricePer1k: 0.75,
    maxTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    displayName: 'Gemini Flash',
    tier: 'light',
    inputPricePer1k: 0.011,
    outputPricePer1k: 0.045,
    maxTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
  },
  // DeepSeek
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    displayName: 'DeepSeek V3',
    tier: 'standard',
    inputPricePer1k: 0.041,
    outputPricePer1k: 0.165,
    maxTokens: 8192,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    displayName: 'DeepSeek R1',
    tier: 'heavy',
    inputPricePer1k: 0.083,
    outputPricePer1k: 0.33,
    maxTokens: 8192,
    supportsStreaming: true,
    supportsVision: false,
  },
  // xAI
  {
    id: 'grok-3',
    provider: 'xai',
    displayName: 'Grok 3',
    tier: 'standard',
    inputPricePer1k: 0.45,
    outputPricePer1k: 2.25,
    maxTokens: 131072,
    supportsStreaming: true,
    supportsVision: true,
  },
];

export function getModelById(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export function getModelsByProvider(provider: string): ModelInfo[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function getModelsByTier(tier: ModelInfo['tier']): ModelInfo[] {
  return MODELS.filter((m) => m.tier === tier);
}

const PROVIDER_ENV_KEYS: Record<ModelInfo['provider'], string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
};

export function isProviderConfigured(provider: ModelInfo['provider']): boolean {
  return !!process.env[PROVIDER_ENV_KEYS[provider]];
}

export function getAvailableModels(): ModelInfo[] {
  return MODELS.filter((m) => isProviderConfigured(m.provider));
}

export const DEFAULT_MODEL_ID = 'gemini-2.0-flash';

export function getDefaultModel(): ModelInfo {
  const model = getModelById(DEFAULT_MODEL_ID);
  if (!model) {
    throw new Error(`Default model ${DEFAULT_MODEL_ID} not found in registry`);
  }
  return model;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AI SDK provider modules before importing
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn((modelId: string) => ({ provider: 'anthropic', modelId })),
}));

vi.mock('@ai-sdk/openai', () => {
  const openai = vi.fn((modelId: string) => ({ provider: 'openai', modelId }));
  const createOpenAI = vi.fn(() => {
    return vi.fn((modelId: string) => ({ provider: 'custom-openai', modelId }));
  });
  return { openai, createOpenAI };
});

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn((modelId: string) => ({ provider: 'google', modelId })),
}));

import { getProvider } from '@/lib/ai/providers';
import { MODELS } from '@/lib/ai/models';

describe('getProvider', () => {
  it('returns a provider for each valid model ID without throwing', () => {
    for (const model of MODELS) {
      expect(() => getProvider(model.id)).not.toThrow();
      const provider = getProvider(model.id);
      expect(provider).toBeDefined();
    }
  });

  it('throws for unknown model ID', () => {
    expect(() => getProvider('nonexistent-model')).toThrow('Unknown model: nonexistent-model');
  });

  it('throws for empty string model ID', () => {
    expect(() => getProvider('')).toThrow('Unknown model: ');
  });

  it('returns anthropic provider for anthropic models', () => {
    const provider = getProvider('claude-sonnet-4-6');
    expect(provider).toBeDefined();
    expect(provider).toHaveProperty('modelId', 'claude-sonnet-4-6');
  });

  it('returns openai provider for openai models', () => {
    const provider = getProvider('gpt-4o');
    expect(provider).toBeDefined();
    expect(provider).toHaveProperty('modelId', 'gpt-4o');
  });

  it('returns google provider for google models', () => {
    const provider = getProvider('gemini-2.0-pro');
    expect(provider).toBeDefined();
    expect(provider).toHaveProperty('modelId', 'gemini-2.0-pro');
  });

  it('returns deepseek provider for deepseek models', () => {
    const provider = getProvider('deepseek-chat');
    expect(provider).toBeDefined();
    expect(provider).toHaveProperty('modelId', 'deepseek-chat');
  });

  it('returns xai provider for xai models', () => {
    const provider = getProvider('grok-3');
    expect(provider).toBeDefined();
    expect(provider).toHaveProperty('modelId', 'grok-3');
  });
});

import { describe, it, expect } from 'vitest';
import {
  MODELS,
  getModelById,
  getModelsByProvider,
  getModelsByTier,
  DEFAULT_MODEL_ID,
  getDefaultModel,
  type ModelInfo,
} from '@/lib/ai/models';

describe('MODELS registry', () => {
  it('has 11 entries', () => {
    expect(MODELS).toHaveLength(11);
  });

  it('has all required fields on each model', () => {
    const requiredKeys: (keyof ModelInfo)[] = [
      'id',
      'provider',
      'displayName',
      'tier',
      'inputPricePer1k',
      'outputPricePer1k',
      'maxTokens',
      'supportsStreaming',
      'supportsVision',
    ];

    for (const model of MODELS) {
      for (const key of requiredKeys) {
        expect(model).toHaveProperty(key);
        expect(model[key]).toBeDefined();
      }
    }
  });

  it('has no duplicate model IDs', () => {
    const ids = MODELS.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all providers are valid', () => {
    const validProviders = ['anthropic', 'openai', 'google', 'deepseek', 'xai'];
    for (const model of MODELS) {
      expect(validProviders).toContain(model.provider);
    }
  });

  it('all tiers are valid', () => {
    const validTiers = ['light', 'standard', 'heavy'];
    for (const model of MODELS) {
      expect(validTiers).toContain(model.tier);
    }
  });

  it('all prices are non-negative numbers', () => {
    for (const model of MODELS) {
      expect(model.inputPricePer1k).toBeGreaterThanOrEqual(0);
      expect(model.outputPricePer1k).toBeGreaterThanOrEqual(0);
    }
  });

  it('all maxTokens are positive', () => {
    for (const model of MODELS) {
      expect(model.maxTokens).toBeGreaterThan(0);
    }
  });
});

describe('getModelById', () => {
  it('returns correct model for valid ID', () => {
    const model = getModelById('claude-sonnet-4-6');
    expect(model).toBeDefined();
    expect(model!.id).toBe('claude-sonnet-4-6');
    expect(model!.provider).toBe('anthropic');
    expect(model!.displayName).toBe('Claude Sonnet');
  });

  it('returns correct model for each known ID', () => {
    for (const expected of MODELS) {
      const found = getModelById(expected.id);
      expect(found).toBeDefined();
      expect(found).toEqual(expected);
    }
  });

  it('returns undefined for unknown ID', () => {
    expect(getModelById('nonexistent-model')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getModelById('')).toBeUndefined();
  });
});

describe('getModelsByProvider', () => {
  it('returns 3 anthropic models', () => {
    const models = getModelsByProvider('anthropic');
    expect(models).toHaveLength(3);
    for (const m of models) {
      expect(m.provider).toBe('anthropic');
    }
  });

  it('returns 3 openai models', () => {
    const models = getModelsByProvider('openai');
    expect(models).toHaveLength(3);
    for (const m of models) {
      expect(m.provider).toBe('openai');
    }
  });

  it('returns 2 google models', () => {
    const models = getModelsByProvider('google');
    expect(models).toHaveLength(2);
    for (const m of models) {
      expect(m.provider).toBe('google');
    }
  });

  it('returns 2 deepseek models', () => {
    const models = getModelsByProvider('deepseek');
    expect(models).toHaveLength(2);
    for (const m of models) {
      expect(m.provider).toBe('deepseek');
    }
  });

  it('returns 1 xai model', () => {
    const models = getModelsByProvider('xai');
    expect(models).toHaveLength(1);
    expect(models[0].provider).toBe('xai');
  });

  it('returns empty array for unknown provider', () => {
    expect(getModelsByProvider('unknown')).toEqual([]);
  });
});

describe('getModelsByTier', () => {
  it('returns models of light tier', () => {
    const models = getModelsByTier('light');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.tier).toBe('light');
    }
  });

  it('returns models of standard tier', () => {
    const models = getModelsByTier('standard');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.tier).toBe('standard');
    }
  });

  it('returns models of heavy tier', () => {
    const models = getModelsByTier('heavy');
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.tier).toBe('heavy');
    }
  });

  it('all models are accounted for across tiers', () => {
    const light = getModelsByTier('light');
    const standard = getModelsByTier('standard');
    const heavy = getModelsByTier('heavy');
    expect(light.length + standard.length + heavy.length).toBe(MODELS.length);
  });
});

describe('DEFAULT_MODEL_ID', () => {
  it('is gemini-2.0-flash', () => {
    expect(DEFAULT_MODEL_ID).toBe('gemini-2.0-flash');
  });

  it('resolves to a valid model', () => {
    const model = getModelById(DEFAULT_MODEL_ID);
    expect(model).toBeDefined();
    expect(model!.id).toBe(DEFAULT_MODEL_ID);
  });
});

describe('getDefaultModel', () => {
  it('returns the default model', () => {
    const model = getDefaultModel();
    expect(model.id).toBe(DEFAULT_MODEL_ID);
    expect(model.provider).toBe('google');
    expect(model.tier).toBe('light');
  });
});

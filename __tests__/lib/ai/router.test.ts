import { describe, it, expect } from 'vitest';
import { detectTier, selectModelForTier, autoRoute } from '@/lib/ai/router';
import { MODELS } from '@/lib/ai/models';
import type { ModelInfo } from '@/lib/ai/models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function modelsOfTier(tier: ModelInfo['tier']) {
  return MODELS.filter((m) => m.tier === tier);
}

// ── detectTier ────────────────────────────────────────────────────────────────

describe('detectTier', () => {
  it('short text → light', () => {
    expect(detectTier('hi')).toBe('light');
  });

  it('code block marker (```) → standard', () => {
    expect(detectTier('Please fix this:\n```\nconst x = 1;\n```')).toBe('standard');
  });

  it('translation keyword 翻訳 → light', () => {
    expect(detectTier('このテキストを翻訳してください')).toBe('light');
  });

  it('translation keyword translate (English) → light', () => {
    expect(detectTier('Please translate this sentence')).toBe('light');
  });

  it('summary keyword 要約 → light', () => {
    expect(detectTier('この記事を要約して')).toBe('light');
  });

  it('summary keyword summarize (English) → light', () => {
    expect(detectTier('Can you summarize this article?')).toBe('light');
  });

  it('analysis keyword 分析 → standard', () => {
    expect(detectTier('データを分析してください')).toBe('standard');
  });

  it('analysis keyword 比較 → standard', () => {
    expect(detectTier('AとBを比較してください')).toBe('standard');
  });

  it('analysis keyword analyze (English) → standard', () => {
    expect(detectTier('Please analyze the results')).toBe('standard');
  });

  it('analysis keyword compare (English) → standard', () => {
    expect(detectTier('Compare these two approaches')).toBe('standard');
  });

  it('heavy keyword 研究 → heavy', () => {
    expect(detectTier('研究の内容を教えてください')).toBe('heavy');
  });

  it('heavy keyword 戦略 → heavy', () => {
    expect(detectTier('マーケティング戦略を立ててください')).toBe('heavy');
  });

  it('heavy keyword research (English) → heavy', () => {
    expect(detectTier('Do research on climate change')).toBe('heavy');
  });

  it('heavy keyword strategy (English) → heavy', () => {
    expect(detectTier('Develop a business strategy')).toBe('heavy');
  });

  it('long text (2500+ chars) → heavy', () => {
    // Need tokens > 2000. With 1.3 tokens/word: ceil(1600 * 1.3) = 2080 > 2000
    const longText = 'word '.repeat(1600);
    expect(detectTier(longText)).toBe('heavy');
  });

  it('medium text within standard range → standard', () => {
    // ~800 words → ceil(800 * 1.3) = 1040 tokens — between 500 and 2000
    const medText = 'word '.repeat(800);
    expect(detectTier(medText)).toBe('standard');
  });
});

// ── selectModelForTier ────────────────────────────────────────────────────────

describe('selectModelForTier', () => {
  it('returns undefined for empty model list', () => {
    expect(selectModelForTier('light', [])).toBeUndefined();
  });

  it('selects cheapest light model from full MODELS list', () => {
    const result = selectModelForTier('light', MODELS);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('light');
    // cheapest light: gpt-4o-mini and gemini-2.0-flash both at 0.011
    expect(result!.inputPricePer1k).toBe(0.011);
  });

  it('selects cheapest standard model from full MODELS list', () => {
    const result = selectModelForTier('standard', MODELS);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('standard');
    // cheapest standard: deepseek-chat at 0.041
    expect(result!.id).toBe('deepseek-chat');
  });

  it('selects cheapest heavy model from full MODELS list', () => {
    const result = selectModelForTier('heavy', MODELS);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('heavy');
    // cheapest heavy: deepseek-reasoner at 0.083
    expect(result!.id).toBe('deepseek-reasoner');
  });

  it('falls back to standard when no light models available', () => {
    const noLight = MODELS.filter((m) => m.tier !== 'light');
    const result = selectModelForTier('light', noLight);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('standard');
  });

  it('falls back to standard when no heavy models available', () => {
    const noHeavy = MODELS.filter((m) => m.tier !== 'heavy');
    const result = selectModelForTier('heavy', noHeavy);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('standard');
  });

  it('falls back to heavy when no light or standard models available', () => {
    const heavyOnly = MODELS.filter((m) => m.tier === 'heavy');
    const result = selectModelForTier('light', heavyOnly);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('heavy');
  });

  it('returns first available model when no tier matches at all', () => {
    // Provide only a single-item list with a mismatched tier
    const single: ModelInfo[] = [MODELS.find((m) => m.tier === 'heavy')!];
    const result = selectModelForTier('light', single);
    // fallback: standard (none) → heavy (found)
    expect(result).toBeDefined();
    expect(result!.tier).toBe('heavy');
  });

  it('selects only model when list has exactly one entry', () => {
    const only = [MODELS[0]];
    const result = selectModelForTier('light', only);
    expect(result).toEqual(MODELS[0]);
  });
});

// ── autoRoute ─────────────────────────────────────────────────────────────────

describe('autoRoute', () => {
  it('uses preset recommended model when it exists in available list', () => {
    const result = autoRoute('hello', MODELS, 'gpt-4o');
    expect(result).toBeDefined();
    expect(result!.id).toBe('gpt-4o');
  });

  it('falls back to tier detection when preset model is not in available list', () => {
    const result = autoRoute('hello', MODELS, 'nonexistent-model-id');
    // Short text → light tier → cheapest light model
    expect(result).toBeDefined();
    expect(result!.tier).toBe('light');
  });

  it('uses tier detection when no preset is provided', () => {
    const result = autoRoute('hello', MODELS);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('light');
  });

  it('uses tier detection when preset is null', () => {
    const result = autoRoute('hello', MODELS, null);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('light');
  });

  it('routes heavy keyword to heavy tier when no preset', () => {
    const result = autoRoute('research the topic in depth', MODELS);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('heavy');
  });

  it('routes standard keyword to standard tier when no preset', () => {
    const result = autoRoute('please analyze these results', MODELS);
    expect(result).toBeDefined();
    expect(result!.tier).toBe('standard');
  });

  it('returns undefined for empty model list', () => {
    expect(autoRoute('hello', [])).toBeUndefined();
  });

  it('preset model takes precedence over keyword-based tier detection', () => {
    // "research" would normally trigger heavy, but preset overrides
    const result = autoRoute('research this topic', MODELS, 'gemini-2.0-flash');
    expect(result).toBeDefined();
    expect(result!.id).toBe('gemini-2.0-flash');
    expect(result!.tier).toBe('light');
  });
});

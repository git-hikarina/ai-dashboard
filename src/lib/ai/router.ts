import { estimateTokens } from '@/lib/ai/token-estimator';
import type { ModelInfo } from '@/lib/ai/models';

type Tier = 'light' | 'standard' | 'heavy';

const KEYWORD_RULES: Array<{ patterns: RegExp[]; tier: Tier }> = [
  { patterns: [/```/], tier: 'standard' },
  { patterns: [/翻訳/, /translate/i, /要約/, /summary/i, /summarize/i], tier: 'light' },
  { patterns: [/分析/, /比較/, /レビュー/, /設計/, /analyze/i, /compare/i, /review/i, /design/i], tier: 'standard' },
  { patterns: [/論文/, /研究/, /戦略/, /thesis/i, /research/i, /strategy/i], tier: 'heavy' },
];

const TOKEN_THRESHOLDS = { light: 500, standard: 2000 } as const;

export function detectTier(text: string): Tier {
  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return rule.tier;
    }
  }
  const tokens = estimateTokens(text);
  if (tokens <= TOKEN_THRESHOLDS.light) return 'light';
  if (tokens <= TOKEN_THRESHOLDS.standard) return 'standard';
  return 'heavy';
}

export function selectModelForTier(tier: Tier, availableModels: ModelInfo[]): ModelInfo | undefined {
  if (availableModels.length === 0) return undefined;
  const tierModels = availableModels.filter((m) => m.tier === tier).sort((a, b) => a.inputPricePer1k - b.inputPricePer1k);
  if (tierModels.length > 0) return tierModels[0];
  const fallbackOrder: Tier[] = tier === 'light' ? ['standard', 'heavy'] : tier === 'heavy' ? ['standard', 'light'] : ['light', 'heavy'];
  for (const fb of fallbackOrder) {
    const models = availableModels.filter((m) => m.tier === fb).sort((a, b) => a.inputPricePer1k - b.inputPricePer1k);
    if (models.length > 0) return models[0];
  }
  return availableModels[0];
}

export function autoRoute(text: string, availableModels: ModelInfo[], presetRecommendedModel?: string | null): ModelInfo | undefined {
  if (presetRecommendedModel) {
    const preset = availableModels.find((m) => m.id === presetRecommendedModel);
    if (preset) return preset;
  }
  const tier = detectTier(text);
  return selectModelForTier(tier, availableModels);
}

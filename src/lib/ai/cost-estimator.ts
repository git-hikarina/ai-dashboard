interface PricingInfo {
  inputPricePer1k: number;
  outputPricePer1k: number;
  maxTokens: number;
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostJpy: number;
  maxCostJpy: number;
  message: string;
}

export const DEFAULT_OUTPUT_TOKENS: Record<string, number> = {
  light: 500,
  standard: 1000,
  heavy: 2000,
};

export function estimateCost(inputTokens: number, outputTokens: number, pricing: PricingInfo): CostEstimate {
  const estimatedCostJpy =
    (inputTokens / 1000) * pricing.inputPricePer1k +
    (outputTokens / 1000) * pricing.outputPricePer1k;
  const maxCostJpy =
    (inputTokens / 1000) * pricing.inputPricePer1k +
    (pricing.maxTokens / 1000) * pricing.outputPricePer1k;
  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostJpy: Math.round(estimatedCostJpy * 100) / 100,
    maxCostJpy: Math.round(maxCostJpy * 100) / 100,
    message: formatCostMessage(estimatedCostJpy, maxCostJpy),
  };
}

export function formatCostMessage(estimated: number, max: number): string {
  const estStr = `¥${Math.round(estimated * 10) / 10}`;
  const maxStr = `¥${Math.round(max * 10) / 10}`;
  return `推定 ${estStr}（最大 ${maxStr} 程度になる可能性があります）`;
}

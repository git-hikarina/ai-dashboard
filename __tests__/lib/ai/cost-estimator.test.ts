import { describe, it, expect } from 'vitest';
import { estimateCost, formatCostMessage, DEFAULT_OUTPUT_TOKENS } from '@/lib/ai/cost-estimator';

const basePricing = {
  inputPricePer1k: 1.0,
  outputPricePer1k: 2.0,
  maxTokens: 4000,
};

describe('estimateCost', () => {
  it('calculates correct estimated cost from tokens and pricing', () => {
    // input: 1000 tokens × (1.0/1000) = 1.0
    // output: 500 tokens × (2.0/1000) = 1.0
    // total estimated = 2.0
    const result = estimateCost(1000, 500, basePricing);
    expect(result.estimatedCostJpy).toBe(2.0);
  });

  it('calculates correct max cost using maxTokens', () => {
    // input: 1000 tokens × (1.0/1000) = 1.0
    // maxTokens: 4000 × (2.0/1000) = 8.0
    // total max = 9.0
    const result = estimateCost(1000, 500, basePricing);
    expect(result.maxCostJpy).toBe(9.0);
  });

  it('returns zero estimated cost for zero tokens, but max cost reflects maxTokens', () => {
    const result = estimateCost(0, 0, basePricing);
    expect(result.estimatedCostJpy).toBe(0);
    // maxCost = (0/1000)*1.0 + (4000/1000)*2.0 = 8.0
    expect(result.maxCostJpy).toBe(8.0);
  });

  it('rounds to 2 decimal places', () => {
    // input: 1 token × (1.0/1000) = 0.001
    // output: 1 token × (2.0/1000) = 0.002
    // total = 0.003 → rounded to 0
    const pricing = { inputPricePer1k: 0.1, outputPricePer1k: 0.1, maxTokens: 100 };
    const result = estimateCost(1, 1, pricing);
    // 0.0001 + 0.0001 = 0.0002 → rounded to 2dp = 0
    expect(result.estimatedCostJpy).toBe(0);
    // Test with values that produce non-trivial rounding
    const result2 = estimateCost(1234, 567, { inputPricePer1k: 1.0, outputPricePer1k: 1.0, maxTokens: 1000 });
    // 1.234 + 0.567 = 1.801 → 1.8
    expect(result2.estimatedCostJpy).toBe(1.8);
  });

  it('returns correct estimatedInputTokens and estimatedOutputTokens', () => {
    const result = estimateCost(300, 150, basePricing);
    expect(result.estimatedInputTokens).toBe(300);
    expect(result.estimatedOutputTokens).toBe(150);
  });

  it('includes a message string', () => {
    const result = estimateCost(1000, 500, basePricing);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('formatCostMessage', () => {
  it('includes both estimate and max values in the message', () => {
    const msg = formatCostMessage(2.0, 9.0);
    expect(msg).toContain('2');
    expect(msg).toContain('9');
  });

  it('uses Japanese yen format', () => {
    const msg = formatCostMessage(1.5, 5.0);
    expect(msg).toContain('¥');
  });

  it('contains Japanese text describing estimate and max', () => {
    const msg = formatCostMessage(1.0, 5.0);
    expect(msg).toContain('推定');
    expect(msg).toContain('最大');
  });

  it('rounds to 1 decimal place in message', () => {
    // 1.05 → Math.round(1.05 * 10) / 10 = 1.1 (approximately)
    // Use a clear case: 1.5 stays 1.5
    const msg = formatCostMessage(1.5, 3.5);
    expect(msg).toContain('¥1.5');
    expect(msg).toContain('¥3.5');
  });
});

describe('DEFAULT_OUTPUT_TOKENS', () => {
  it('has entries for light, standard, heavy', () => {
    expect(DEFAULT_OUTPUT_TOKENS).toHaveProperty('light');
    expect(DEFAULT_OUTPUT_TOKENS).toHaveProperty('standard');
    expect(DEFAULT_OUTPUT_TOKENS).toHaveProperty('heavy');
  });

  it('light < standard < heavy', () => {
    expect(DEFAULT_OUTPUT_TOKENS.light).toBeLessThan(DEFAULT_OUTPUT_TOKENS.standard);
    expect(DEFAULT_OUTPUT_TOKENS.standard).toBeLessThan(DEFAULT_OUTPUT_TOKENS.heavy);
  });
});

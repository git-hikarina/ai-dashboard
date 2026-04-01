import { describe, it, expect } from 'vitest';
import {
  formatHighCostAlert,
  formatBudgetAlert,
  shouldSendBudgetAlert,
} from '../../../src/lib/slack/notify';

describe('formatHighCostAlert', () => {
  it('formats a high cost alert message with all fields', () => {
    const result = formatHighCostAlert({
      userName: 'テストユーザー',
      modelName: 'gpt-4o',
      estimatedCost: 1500,
      sessionTitle: 'テストセッション',
    });
    expect(result).toContain(':bell: *高額リクエスト承認依頼*');
    expect(result).toContain('ユーザー: テストユーザー');
    expect(result).toContain('モデル: gpt-4o');
    expect(result).toContain('推定コスト: ¥1,500');
    expect(result).toContain('セッション: 「テストセッション」');
    expect(result).toContain('管理者ダッシュボードで承認/却下してください');
  });

  it("uses '無題' when sessionTitle is null", () => {
    const result = formatHighCostAlert({
      userName: 'ユーザー',
      modelName: 'claude-3',
      estimatedCost: 2000,
      sessionTitle: null,
    });
    expect(result).toContain('セッション: 「無題」');
  });

  it('formats cost in JPY', () => {
    const result = formatHighCostAlert({
      userName: 'ユーザー',
      modelName: 'claude-3',
      estimatedCost: 1234.7,
      sessionTitle: null,
    });
    expect(result).toContain('推定コスト: ¥1,235');
  });
});

describe('formatBudgetAlert', () => {
  it('formats 80% budget alert with remaining amount', () => {
    const result = formatBudgetAlert({
      orgName: 'テスト組織',
      usedAmount: 8000,
      budgetAmount: 10000,
      percentage: 80,
    });
    expect(result).toContain(':warning:');
    expect(result).toContain('月間予算アラート（80%到達）');
    expect(result).toContain('組織: テスト組織');
    expect(result).toContain('¥8,000');
    expect(result).toContain('¥10,000');
    expect(result).toContain('残り: ¥2,000');
  });

  it('formats 100%+ budget alert with excess amount and :rotating_light:', () => {
    const result = formatBudgetAlert({
      orgName: 'テスト組織',
      usedAmount: 12000,
      budgetAmount: 10000,
      percentage: 120,
    });
    expect(result).toContain(':rotating_light:');
    expect(result).toContain('月間予算超過');
    expect(result).toContain('超過: ¥2,000');
    expect(result).not.toContain('残り:');
  });

  it('shows percentage rounded', () => {
    const result = formatBudgetAlert({
      orgName: 'テスト組織',
      usedAmount: 8333,
      budgetAmount: 10000,
      percentage: 83.33,
    });
    expect(result).toContain('83%');
  });
});

describe('shouldSendBudgetAlert', () => {
  it('returns 80 when crossing 80% threshold for the first time', () => {
    expect(shouldSendBudgetAlert(8000, 10000, false, false)).toBe(80);
  });

  it('returns 100 when crossing 100% threshold for the first time', () => {
    expect(shouldSendBudgetAlert(10000, 10000, true, false)).toBe(100);
  });

  it('returns null when 80% alert already sent and under 100%', () => {
    expect(shouldSendBudgetAlert(9000, 10000, true, false)).toBeNull();
  });

  it('returns null when both alerts already sent', () => {
    expect(shouldSendBudgetAlert(11000, 10000, true, true)).toBeNull();
  });

  it('returns null when below 80%', () => {
    expect(shouldSendBudgetAlert(7000, 10000, false, false)).toBeNull();
  });

  it('returns null when budget is 0', () => {
    expect(shouldSendBudgetAlert(1000, 0, false, false)).toBeNull();
  });

  it('returns 100 (not 80) when crossing both thresholds at once (100 takes priority)', () => {
    expect(shouldSendBudgetAlert(10500, 10000, false, false)).toBe(100);
  });
});

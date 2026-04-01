import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateConversationTokens } from '@/lib/ai/token-estimator';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for empty-like falsy value', () => {
    // @ts-expect-error testing runtime behavior with null-ish input
    expect(estimateTokens(null)).toBe(0);
  });

  it('estimates Japanese text at ~1.5 tokens per CJK character', () => {
    // 4 CJK chars → ceil(4 * 1.5) = 6 tokens
    const result = estimateTokens('日本語テスト');
    // 6 chars → ceil(6 * 1.5) = 9
    expect(result).toBe(9);
  });

  it('estimates English text at ~1.3 tokens per word', () => {
    // "hello world" → 2 words → ceil(2 * 1.3) = 3
    expect(estimateTokens('hello world')).toBe(3);
  });

  it('estimates single English word', () => {
    // 1 word → ceil(1 * 1.3) = 2
    expect(estimateTokens('hello')).toBe(2);
  });

  it('estimates four English words', () => {
    // 4 words → ceil(4 * 1.3) = 6
    expect(estimateTokens('one two three four')).toBe(6);
  });

  it('handles mixed CJK and English text', () => {
    // "日本語 hello world"
    // CJK: 3 chars → ceil(3 * 1.5) = 5
    // non-CJK after replacement: "   hello world" → words: ["hello", "world"] → 2 words → ceil(2 * 1.3) = 3
    const result = estimateTokens('日本語 hello world');
    expect(result).toBe(5 + 3); // 8
  });

  it('handles text with only spaces', () => {
    expect(estimateTokens('   ')).toBe(0);
  });

  it('handles a single CJK character', () => {
    // 1 CJK → ceil(1 * 1.5) = 2
    expect(estimateTokens('日')).toBe(2);
  });
});

describe('estimateConversationTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateConversationTokens([])).toBe(0);
  });

  it('sums tokens across single message', () => {
    const msgs = [{ content: 'hello world' }];
    // 2 words → ceil(2 * 1.3) = 3
    expect(estimateConversationTokens(msgs)).toBe(3);
  });

  it('sums tokens across multiple messages', () => {
    const msgs = [
      { content: 'hello world' },   // 2 words → 3
      { content: 'foo bar baz' },   // 3 words → ceil(3 * 1.3) = 4
    ];
    expect(estimateConversationTokens(msgs)).toBe(3 + 4); // 7
  });

  it('handles messages with CJK content', () => {
    const msgs = [
      { content: '日本語' },  // 3 CJK → ceil(3 * 1.5) = 5
      { content: 'hello' },   // 1 word → ceil(1.3) = 2
    ];
    expect(estimateConversationTokens(msgs)).toBe(5 + 2); // 7
  });

  it('handles messages with empty content', () => {
    const msgs = [
      { content: '' },
      { content: 'hello world' }, // 2 words → 3
    ];
    expect(estimateConversationTokens(msgs)).toBe(3);
  });
});

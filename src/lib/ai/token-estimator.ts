const CJK_REGEX = /[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches?.length ?? 0;
  const cjkTokens = Math.ceil(cjkCount * 1.5);
  const nonCjk = text.replace(CJK_REGEX, ' ').trim();
  const words = nonCjk ? nonCjk.split(/\s+/).filter(Boolean) : [];
  const wordTokens = Math.ceil(words.length * 1.3);
  return cjkTokens + wordTokens;
}

export function estimateConversationTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

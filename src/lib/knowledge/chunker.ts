export interface ChunkOptions {
  maxTokens: number;    // デフォルト 500
  overlapTokens: number; // デフォルト 50
}

export interface TextChunk {
  index: number;
  content: string;
  tokenCount: number;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxTokens: 500,
  overlapTokens: 50,
};

/**
 * 文字数ベースのトークン推定。
 * 日本語: 約1.5文字/トークン, 英語: 約4文字/トークン
 * 混在テキストの近似として 約2文字/トークン を使用。
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * テキストをチャンクに分割する。
 * 段落境界を優先し、オーバーラップで文脈を保持する。
 */
export function chunkText(
  text: string,
  options: Partial<ChunkOptions> = {},
): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxChars = opts.maxTokens * 2; // トークン→文字数の近似
  const overlapChars = opts.overlapTokens * 2;

  if (estimateTokens(text) <= opts.maxTokens) {
    return [{ index: 0, content: text, tokenCount: estimateTokens(text) }];
  }

  // 段落で分割
  const paragraphs = text.split(/\n{2,}/);
  const chunks: TextChunk[] = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length > maxChars && current) {
      // 現在のチャンクを確定
      chunks.push({
        index: chunks.length,
        content: current.trim(),
        tokenCount: estimateTokens(current.trim()),
      });
      // オーバーラップ: 前のチャンクの末尾を次のチャンクの先頭に含める
      const overlap = current.slice(-overlapChars);
      current = overlap ? `${overlap}\n\n${para}` : para;
    } else {
      current = candidate;
    }
  }

  // 残りを最終チャンクとして追加
  if (current.trim()) {
    chunks.push({
      index: chunks.length,
      content: current.trim(),
      tokenCount: estimateTokens(current.trim()),
    });
  }

  return chunks;
}

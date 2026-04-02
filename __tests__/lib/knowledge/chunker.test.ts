import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/knowledge/chunker";

describe("chunkText", () => {
  it("should return single chunk for short text", () => {
    const chunks = chunkText("短いテキスト", { maxTokens: 500, overlapTokens: 50 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("短いテキスト");
    expect(chunks[0].index).toBe(0);
  });

  it("should split long text into multiple chunks", () => {
    // 各段落が十分長いテキストを作成
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `段落${i + 1}: ${"あ".repeat(100)}`
    );
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, { maxTokens: 200, overlapTokens: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    // インデックスが連続していること
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("should prefer paragraph boundaries for splitting", () => {
    const text = "段落A。\n\n段落B。\n\n段落C。";
    const chunks = chunkText(text, { maxTokens: 10, overlapTokens: 0 });
    // 段落境界で分割されていること
    expect(chunks[0].content).toContain("段落A");
  });

  it("should estimate token count for each chunk", () => {
    const chunks = chunkText("Hello world", { maxTokens: 500, overlapTokens: 50 });
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });
});

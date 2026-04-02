import { describe, it, expect } from "vitest";
import { extractText } from "@/lib/knowledge/extractor";

describe("extractText", () => {
  it("should extract plain text as-is", async () => {
    const result = await extractText({
      type: "text",
      content: "これはテストです。\n改行もあります。",
    });
    expect(result).toBe("これはテストです。\n改行もあります。");
  });

  it("should throw for unsupported type", async () => {
    await expect(
      extractText({ type: "unknown" as any, content: "" }),
    ).rejects.toThrow("Unsupported source type");
  });

  it("should extract text from HTML (URL source)", async () => {
    const html = `
      <html><body>
        <nav>ナビ</nav>
        <main><p>本文テキスト</p></main>
        <script>console.log("skip")</script>
      </body></html>
    `;
    const result = await extractText({ type: "url", html });
    expect(result).toContain("本文テキスト");
    expect(result).not.toContain("console.log");
  });
});

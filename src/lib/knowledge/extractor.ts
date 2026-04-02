import * as cheerio from "cheerio";

export type ExtractInput =
  | { type: "text"; content: string }
  | { type: "pdf"; buffer: Buffer }
  | { type: "docx"; buffer: Buffer }
  | { type: "url"; html: string };

/**
 * ドキュメントからプレーンテキストを抽出する。
 * PDF/DOCXはバッファ、URLはフェッチ済みHTMLを受け取る。
 */
export async function extractText(input: ExtractInput): Promise<string> {
  switch (input.type) {
    case "text":
      return input.content;

    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(input.buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }

    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: input.buffer });
      return result.value;
    }

    case "url": {
      const $ = cheerio.load(input.html);
      // スクリプト・スタイル・ナビを除去
      $("script, style, nav, header, footer, aside").remove();
      return $("body").text().replace(/\s+/g, " ").trim();
    }

    default:
      throw new Error(`Unsupported source type: ${(input as any).type}`);
  }
}

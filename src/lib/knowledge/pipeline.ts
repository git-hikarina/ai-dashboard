import { createServiceClient } from "@/lib/supabase/server";
import { extractText, type ExtractInput } from "./extractor";
import { chunkText } from "./chunker";
import { generateEmbeddings } from "./embeddings";

/**
 * ドキュメントの非同期処理パイプライン。
 * テキスト抽出 → チャンク分割 → エンベディング → DB保存。
 * エラー時はドキュメントのstatusを"error"に更新。
 */
export async function processDocument(
  documentId: string,
  input: ExtractInput,
): Promise<void> {
  const supabase = createServiceClient();

  try {
    // 1. テキスト抽出
    const text = await extractText(input);

    if (!text.trim()) {
      await supabase
        .from("knowledge_documents")
        .update({ status: "error", error_message: "テキストを抽出できませんでした" })
        .eq("id", documentId);
      return;
    }

    // 2. チャンク分割
    const chunks = chunkText(text);

    // 3. エンベディング生成
    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

    // 4. チャンクをDBに保存
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: JSON.stringify(embeddings[i]),
    }));

    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(chunkRows);

    if (insertError) throw insertError;

    // 5. ドキュメントのステータスを更新
    await supabase
      .from("knowledge_documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
      })
      .eq("id", documentId);
  } catch (error) {
    console.error(`[Pipeline] Document ${documentId} failed:`, error);
    const message = error instanceof Error ? error.message : "処理中にエラーが発生しました";
    await supabase
      .from("knowledge_documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId);
  }
}

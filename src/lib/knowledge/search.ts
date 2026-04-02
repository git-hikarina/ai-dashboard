import { createServiceClient } from "@/lib/supabase/server";
import { generateQueryEmbedding } from "./embeddings";

export interface KnowledgeChunk {
  content: string;
  chunkIndex: number;
  documentTitle: string;
  documentId: string;
  similarity: number;
}

/**
 * プロジェクト横断でベクトル類似検索を行う。
 * 将来的にベクトルDB変更時はこの関数の中身を差し替える。
 */
export async function searchKnowledge(
  query: string,
  projectIds: string[],
  limit: number = 5,
): Promise<KnowledgeChunk[]> {
  if (projectIds.length === 0) return [];

  const supabase = createServiceClient();
  const queryEmbedding = await generateQueryEmbedding(query);

  // pgvector のコサイン距離で類似検索
  // Supabase JS client では RPC を使う
  const { data, error } = await supabase.rpc("search_knowledge_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    project_ids: projectIds,
    match_limit: limit,
  });

  if (error) {
    console.error("[SearchKnowledge] Error:", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    content: row.content,
    chunkIndex: row.chunk_index,
    documentTitle: row.document_title,
    documentId: row.document_id,
    similarity: row.similarity,
  }));
}

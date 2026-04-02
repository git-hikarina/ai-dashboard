# Phase 3a: ドキュメントRAG 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロジェクト単位でドキュメントを管理し、チャット時にベクトル検索で関連情報をAIに注入する

**Architecture:** Supabase pgvector完結型。ドキュメントアップロード→非同期でテキスト抽出・チャンク分割・エンベディング→DBに保存。チャット時にユーザー質問をベクトル化し、類似チャンクを検索してシステムプロンプトに注入。

**Tech Stack:** Next.js 16 (App Router), Supabase pgvector, OpenAI text-embedding-3-small (1536dim), pdf-parse, mammoth, cheerio, Vitest

**Design Spec:** `docs/superpowers/specs/2026-04-02-phase3-knowledge-design.md`

---

## File Structure

### New Files
```
supabase/migrations/003_phase3_schema.sql          — pgvector + 4 new tables + sessions変更
src/lib/supabase/types.ts                           — MODIFY: 新テーブル型追加
src/lib/knowledge/extractor.ts                      — テキスト抽出 (PDF/DOCX/URL/テキスト)
src/lib/knowledge/chunker.ts                        — チャンク分割 (500tok, 50tok overlap)
src/lib/knowledge/embeddings.ts                     — OpenAI エンベディング生成
src/lib/knowledge/search.ts                         — ベクトル類似検索 (抽象化レイヤー)
src/lib/knowledge/pipeline.ts                       — 処理パイプライン (抽出→分割→埋め込み→保存)
src/app/api/projects/route.ts                       — GET (一覧), POST (作成)
src/app/api/projects/[id]/route.ts                  — GET, PATCH, DELETE
src/app/api/projects/[id]/members/route.ts          — GET, POST
src/app/api/projects/[id]/members/[userId]/route.ts — DELETE
src/app/api/knowledge/documents/route.ts            — GET (一覧), POST (アップロード)
src/app/api/knowledge/documents/[id]/route.ts       — GET (ポーリング), DELETE
src/app/projects/page.tsx                           — プロジェクト一覧ページ
src/app/projects/[id]/page.tsx                      — プロジェクト詳細 (ドキュメント管理)
src/components/knowledge/project-card.tsx            — プロジェクトカード
src/components/knowledge/document-table.tsx          — ドキュメント一覧テーブル
src/components/knowledge/file-dropzone.tsx           — ドラッグ&ドロップアップロード
src/components/knowledge/url-input-dialog.tsx        — URL追加ダイアログ
src/components/knowledge/project-selector.tsx        — チャットツールバー用プロジェクト選択
src/components/chat/citation-display.tsx             — 出典表示
__tests__/lib/knowledge/chunker.test.ts              — チャンカーテスト
__tests__/lib/knowledge/extractor.test.ts            — 抽出テスト
__tests__/lib/knowledge/search.test.ts               — 検索テスト
```

### Modified Files
```
src/lib/supabase/types.ts                           — 新テーブル型追加
src/app/api/chat/route.ts                           — RAGコンテキスト注入
src/app/chat/[id]/page.tsx                          — プロジェクトセレクター追加
src/components/layout/header.tsx                    — ナレッジドロップダウン追加
src/stores/chat-store.ts                            — projectIds フィールド追加
```

---

### Task 1: DBマイグレーション + TypeScript型定義

**Files:**
- Create: `supabase/migrations/003_phase3_schema.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: マイグレーションSQLを作成**

```sql
-- ============================================================
-- Phase 3: ナレッジ (RAG) スキーマ
-- ============================================================

-- pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- projects: ナレッジプロジェクト
-- ============================================================
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 組織内でデフォルトは1つだけ
CREATE UNIQUE INDEX idx_projects_org_default
  ON projects (organization_id) WHERE is_default = true;

CREATE INDEX idx_projects_organization ON projects(organization_id);

-- ============================================================
-- project_members: プロジェクトメンバー (多対多)
-- ============================================================
CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_project_members_user ON project_members(user_id);

-- ============================================================
-- knowledge_documents: ナレッジドキュメント
-- ============================================================
CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('text', 'pdf', 'docx', 'url')),
  source_url text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error_message text,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_knowledge_documents_project ON knowledge_documents(project_id);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(status);

-- ============================================================
-- document_chunks: ドキュメントチャンク + ベクトル
-- ============================================================
CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_document_chunks_document ON document_chunks(document_id);

-- IVFFlat インデックス (チャンクが100以上になってから有効)
-- 初期段階ではexact searchで十分。データが増えたら以下を実行:
-- CREATE INDEX idx_document_chunks_embedding ON document_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- sessions テーブルにproject_idsカラムを追加
-- ============================================================
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS project_ids uuid[] DEFAULT '{}';
```

- [ ] **Step 2: TypeScript型定義を追加**

`src/lib/supabase/types.ts` の末尾に以下を追加:

```typescript
// ---------------------------------------------------------------------------
// Phase 3: Knowledge (RAG)
// ---------------------------------------------------------------------------

export type ProjectMemberRole = "admin" | "member";

export type DocumentSourceType = "text" | "pdf" | "docx" | "url";

export type DocumentStatus = "processing" | "ready" | "error";

export interface DbProject {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DbProjectInsert = Omit<DbProject, "id" | "created_at" | "updated_at"> &
  Partial<Pick<DbProject, "id">>;

export type DbProjectUpdate = Partial<Omit<DbProject, "id" | "created_at">>;

export interface DbProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: string;
}

export interface DbKnowledgeDocument {
  id: string;
  project_id: string;
  title: string;
  source_type: DocumentSourceType;
  source_url: string | null;
  status: DocumentStatus;
  error_message: string | null;
  uploaded_by: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export type DbKnowledgeDocumentInsert = Omit<
  DbKnowledgeDocument,
  "id" | "created_at" | "updated_at" | "chunk_count" | "error_message"
> &
  Partial<Pick<DbKnowledgeDocument, "id">>;

export interface DbDocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: number[] | null;
  created_at: string;
}
```

- [ ] **Step 3: マイグレーションをSupabaseに適用**

Supabase MCP の `execute_sql` でSQLを実行（project_id: `oorcknnpyzripqmffzfd`）。

- [ ] **Step 4: 型チェック**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/003_phase3_schema.sql src/lib/supabase/types.ts
git commit -m "feat(phase3): pgvectorとナレッジ関連テーブルのマイグレーション・型定義を追加"
```

---

### Task 2: テキスト抽出モジュール

**Files:**
- Create: `src/lib/knowledge/extractor.ts`
- Create: `__tests__/lib/knowledge/extractor.test.ts`

- [ ] **Step 1: 依存パッケージをインストール**

```bash
cd ai-dashboard && npm install pdf-parse mammoth cheerio
```

- [ ] **Step 2: テストを作成**

```typescript
// __tests__/lib/knowledge/extractor.test.ts
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
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/knowledge/extractor.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 4: 抽出モジュールを実装**

```typescript
// src/lib/knowledge/extractor.ts
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
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(input.buffer);
      return data.text;
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
```

- [ ] **Step 5: テストが通ることを確認**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/knowledge/extractor.test.ts
```

Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/lib/knowledge/extractor.ts __tests__/lib/knowledge/extractor.test.ts package.json package-lock.json
git commit -m "feat(phase3): テキスト抽出モジュール（PDF/DOCX/URL/テキスト対応）を追加"
```

---

### Task 3: テキストチャンクモジュール

**Files:**
- Create: `src/lib/knowledge/chunker.ts`
- Create: `__tests__/lib/knowledge/chunker.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
// __tests__/lib/knowledge/chunker.test.ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/knowledge/chunker.test.ts
```

- [ ] **Step 3: チャンクモジュールを実装**

```typescript
// src/lib/knowledge/chunker.ts

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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/knowledge/chunker.test.ts
```

- [ ] **Step 5: コミット**

```bash
git add src/lib/knowledge/chunker.ts __tests__/lib/knowledge/chunker.test.ts
git commit -m "feat(phase3): テキストチャンク分割モジュールを追加"
```

---

### Task 4: エンベディングモジュール

**Files:**
- Create: `src/lib/knowledge/embeddings.ts`

- [ ] **Step 1: OpenAIパッケージをインストール**

```bash
cd ai-dashboard && npm install openai
```

- [ ] **Step 2: エンベディングモジュールを実装**

```typescript
// src/lib/knowledge/embeddings.ts
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI APIのバッチ上限

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * テキスト配列をバッチでエンベディング化する。
 * 100件ずつAPIに送信。
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const openai = getClient();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

/**
 * 単一テキストをエンベディング化する（チャット時のクエリ用）。
 */
export async function generateQueryEmbedding(
  text: string,
): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
```

- [ ] **Step 3: 型チェック**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 4: コミット**

```bash
git add src/lib/knowledge/embeddings.ts package.json package-lock.json
git commit -m "feat(phase3): OpenAIエンベディング生成モジュールを追加"
```

---

### Task 5: 処理パイプライン

**Files:**
- Create: `src/lib/knowledge/pipeline.ts`

- [ ] **Step 1: パイプラインを実装**

```typescript
// src/lib/knowledge/pipeline.ts
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
```

- [ ] **Step 2: 型チェック**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 3: コミット**

```bash
git add src/lib/knowledge/pipeline.ts
git commit -m "feat(phase3): ドキュメント処理パイプライン（抽出→分割→埋込→保存）を追加"
```

---

### Task 6: ベクトル検索モジュール

**Files:**
- Create: `src/lib/knowledge/search.ts`
- Create: `__tests__/lib/knowledge/search.test.ts`

- [ ] **Step 1: 検索モジュールを実装**

```typescript
// src/lib/knowledge/search.ts
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
```

- [ ] **Step 2: Supabase RPC関数を作成**

マイグレーションSQLに以下のRPC関数を追記（`003_phase3_schema.sql` の末尾に追加）:

```sql
-- ============================================================
-- ベクトル類似検索 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  query_embedding vector(1536),
  project_ids uuid[],
  match_limit integer DEFAULT 5
)
RETURNS TABLE (
  content text,
  chunk_index integer,
  document_title text,
  document_id uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.content,
    dc.chunk_index,
    kd.title AS document_title,
    kd.id AS document_id,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN knowledge_documents kd ON kd.id = dc.document_id
  WHERE kd.project_id = ANY(project_ids)
    AND kd.status = 'ready'
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_limit;
$$;
```

- [ ] **Step 3: RPC関数をSupabaseに適用**

Supabase MCP の `execute_sql` でRPC関数を作成。

- [ ] **Step 4: 型チェック**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 5: コミット**

```bash
git add src/lib/knowledge/search.ts supabase/migrations/003_phase3_schema.sql
git commit -m "feat(phase3): ベクトル類似検索モジュールとSupabase RPC関数を追加"
```

---

### Task 7: プロジェクトCRUD API

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: プロジェクト一覧 + 作成APIを実装**

```typescript
// src/app/api/projects/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

// GET: ユーザーがアクセス可能なプロジェクト一覧
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    // プロジェクトメンバーとして参加、またはsystem_adminなら全組織のプロジェクト
    let query = supabase
      .from("projects")
      .select("*, project_members(user_id, role), knowledge_documents(id)")
      .order("created_at", { ascending: false });

    if (ctx.isSystemAdmin) {
      // system_admin: 全プロジェクト
    } else {
      // メンバーとして参加しているプロジェクト or 所属組織のプロジェクト
      const orgIds = ctx.orgIds;
      query = query.in("organization_id", orgIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    // メンバー数・ドキュメント数を計算して返す
    const projects = (data ?? []).map((p: any) => ({
      ...p,
      member_count: p.project_members?.length ?? 0,
      document_count: p.knowledge_documents?.length ?? 0,
      project_members: undefined,
      knowledge_documents: undefined,
    }));

    return NextResponse.json(projects);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: プロジェクト作成
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const body = await request.json();

    const { name, description, organization_id, is_default } = body;
    if (!name || !organization_id) {
      return NextResponse.json(
        { error: "name と organization_id は必須です" },
        { status: 400 },
      );
    }

    // 組織アクセス権チェック
    if (!ctx.isSystemAdmin && !ctx.orgIds.includes(organization_id)) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // プロジェクト作成
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name,
        description: description ?? "",
        organization_id,
        is_default: is_default ?? false,
        created_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // 作成者をadminメンバーとして追加
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: ctx.user.id,
      role: "admin",
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: プロジェクト詳細 + 更新 + 削除APIを実装**

```typescript
// src/app/api/projects/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET: プロジェクト詳細
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    }

    // アクセス権チェック
    if (!ctx.isSystemAdmin && !ctx.orgIds.includes(data.organization_id)) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH: プロジェクト更新
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const body = await request.json();

    // プロジェクトのadminまたはsystem_adminのみ
    if (!ctx.isSystemAdmin) {
      const { data: member } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", ctx.user.id)
        .single();

      if (member?.role !== "admin") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    const { name, description, is_default } = body;
    const { data, error } = await supabase
      .from("projects")
      .update({ name, description, is_default })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE: プロジェクト削除（チャンク・ドキュメントもCASCADE削除）
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    if (!ctx.isSystemAdmin) {
      const { data: member } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", ctx.user.id)
        .single();

      if (member?.role !== "admin") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 3: 型チェック**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 4: コミット**

```bash
git add src/app/api/projects/
git commit -m "feat(phase3): プロジェクトCRUD API（一覧・作成・詳細・更新・削除）を追加"
```

---

### Task 8: プロジェクトメンバーAPI

**Files:**
- Create: `src/app/api/projects/[id]/members/route.ts`
- Create: `src/app/api/projects/[id]/members/[userId]/route.ts`

- [ ] **Step 1: メンバー一覧 + 追加APIを実装**

```typescript
// src/app/api/projects/[id]/members/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET: メンバー一覧
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("project_members")
      .select("user_id, role, created_at, users(email, display_name)")
      .eq("project_id", id);

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: メンバー追加
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const body = await request.json();

    // project adminまたはsystem_adminのみ
    if (!ctx.isSystemAdmin) {
      const { data: member } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", ctx.user.id)
        .single();

      if (member?.role !== "admin") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    const { user_id, role } = body;
    if (!user_id) {
      return NextResponse.json({ error: "user_id は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_members")
      .insert({ project_id: id, user_id, role: role ?? "member" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: メンバー削除APIを実装**

```typescript
// src/app/api/projects/[id]/members/[userId]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; userId: string }> };

// DELETE: メンバー削除
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id, userId } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    if (!ctx.isSystemAdmin) {
      const { data: member } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", ctx.user.id)
        .single();

      if (member?.role !== "admin") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", id)
      .eq("user_id", userId);

    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 3: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/app/api/projects/
git commit -m "feat(phase3): プロジェクトメンバー管理API（一覧・追加・削除）を追加"
```

---

### Task 9: ドキュメント管理API（非同期アップロード）

**Files:**
- Create: `src/app/api/knowledge/documents/route.ts`
- Create: `src/app/api/knowledge/documents/[id]/route.ts`

- [ ] **Step 1: ドキュメント一覧 + アップロードAPIを実装**

```typescript
// src/app/api/knowledge/documents/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/knowledge/pipeline";
import type { ExtractInput } from "@/lib/knowledge/extractor";

// GET: ドキュメント一覧
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: ドキュメントアップロード（非同期処理）
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const contentType = request.headers.get("content-type") ?? "";

    let projectId: string;
    let title: string;
    let sourceType: string;
    let sourceUrl: string | null = null;
    let extractInput: ExtractInput;

    if (contentType.includes("multipart/form-data")) {
      // ファイルアップロード
      const formData = await request.formData();
      projectId = formData.get("projectId") as string;
      title = formData.get("title") as string;
      sourceType = formData.get("sourceType") as string;
      const file = formData.get("file") as File;

      if (!file || !projectId) {
        return NextResponse.json(
          { error: "file と projectId は必須です" },
          { status: 400 },
        );
      }

      title = title || file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      if (sourceType === "pdf") {
        extractInput = { type: "pdf", buffer };
      } else if (sourceType === "docx") {
        extractInput = { type: "docx", buffer };
      } else {
        extractInput = { type: "text", content: buffer.toString("utf-8") };
      }
    } else {
      // JSON (テキストまたはURL)
      const body = await request.json();
      projectId = body.projectId;
      title = body.title;
      sourceType = body.sourceType;
      sourceUrl = body.sourceUrl ?? null;

      if (!projectId || !title || !sourceType) {
        return NextResponse.json(
          { error: "projectId, title, sourceType は必須です" },
          { status: 400 },
        );
      }

      if (sourceType === "url") {
        if (!sourceUrl) {
          return NextResponse.json({ error: "sourceUrl は必須です" }, { status: 400 });
        }
        const res = await fetch(sourceUrl);
        if (!res.ok) {
          return NextResponse.json(
            { error: `URL取得に失敗しました: ${res.status}` },
            { status: 400 },
          );
        }
        const html = await res.text();
        extractInput = { type: "url", html };
      } else {
        extractInput = { type: "text", content: body.content ?? "" };
      }
    }

    // メタデータ保存
    const { data: doc, error } = await supabase
      .from("knowledge_documents")
      .insert({
        project_id: projectId,
        title,
        source_type: sourceType,
        source_url: sourceUrl,
        status: "processing",
        uploaded_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // バックグラウンドで処理（waitUntil が使えない場合はfire-and-forget）
    processDocument(doc.id, extractInput).catch((err) =>
      console.error("[DocumentUpload] Background processing failed:", err),
    );

    return NextResponse.json(doc, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: ドキュメント詳細（ポーリング用）+ 削除APIを実装**

```typescript
// src/app/api/knowledge/documents/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET: ドキュメント詳細（ポーリング用）
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE: ドキュメント削除（チャンクもCASCADE削除）
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("knowledge_documents")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 3: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/app/api/knowledge/
git commit -m "feat(phase3): ドキュメント管理API（非同期アップロード・ポーリング・削除）を追加"
```

---

### Task 10: チャットRAG統合

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/stores/chat-store.ts`

- [ ] **Step 1: chat-storeにprojectIdsフィールドを追加**

`src/stores/chat-store.ts` の `ChatTab` インターフェースに追加:

```typescript
// ChatTab に追加
projectIds: string[];
```

`openTab` の初期化で `projectIds: session.projectIds ?? []` を追加。

新しいアクション:

```typescript
updateTabProjectIds: (sessionId: string, projectIds: string[]) => void;
```

実装:

```typescript
updateTabProjectIds: (sessionId, projectIds) =>
  set((state) => ({
    tabs: state.tabs.map((t) =>
      t.sessionId === sessionId ? { ...t, projectIds } : t,
    ),
  })),
```

- [ ] **Step 2: チャットAPIにRAGコンテキスト注入を追加**

`src/app/api/chat/route.ts` の `streamText()` 呼び出し前に以下を追加:

```typescript
import { searchKnowledge } from "@/lib/knowledge/search";

// --- RAG コンテキスト注入 ---
let ragContext = "";
const projectIds: string[] = body.projectIds ?? [];

// projectIdsが空の場合、デフォルトプロジェクトを検索
let activeProjectIds = projectIds;
if (activeProjectIds.length === 0) {
  const { data: defaultProject } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", user.active_organization_id)
    .eq("is_default", true)
    .single();

  if (defaultProject) {
    activeProjectIds = [defaultProject.id];
  }
}

// RAG検索
let citations: Array<{ title: string; chunkIndex: number }> = [];
if (activeProjectIds.length > 0) {
  const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
  if (lastUserMessage?.content) {
    const chunks = await searchKnowledge(
      typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content),
      activeProjectIds,
      5,
    );

    if (chunks.length > 0) {
      ragContext = "\n\n以下の参考情報を踏まえて回答してください：\n" +
        chunks
          .map((c) => `---\n${c.content}\n出典: ${c.documentTitle}\n---`)
          .join("\n");

      citations = chunks.map((c) => ({
        title: c.documentTitle,
        chunkIndex: c.chunkIndex,
      }));
    }
  }
}

// systemPrompt の末尾に ragContext を付加
const fullSystemPrompt = systemPrompt + ragContext;
```

`streamText()` の `system` パラメータを `fullSystemPrompt` に変更。

レスポンスヘッダーに出典情報を含める:

```typescript
const response = result.toUIMessageStreamResponse();
if (citations.length > 0) {
  response.headers.set("X-Citations", JSON.stringify(citations));
}
return response;
```

- [ ] **Step 3: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/app/api/chat/route.ts src/stores/chat-store.ts
git commit -m "feat(phase3): チャットAPIにRAGコンテキスト注入と出典情報を追加"
```

---

### Task 11: プロジェクト一覧ページ

**Files:**
- Create: `src/app/projects/page.tsx`
- Create: `src/components/knowledge/project-card.tsx`

- [ ] **Step 1: プロジェクトカードコンポーネントを作成**

```typescript
// src/components/knowledge/project-card.tsx
"use client";

import { FolderOpen, FileText, Users } from "lucide-react";

interface ProjectCardProps {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  documentCount: number;
  memberCount: number;
  onClick: (id: string) => void;
}

export function ProjectCard({
  id,
  name,
  description,
  isDefault,
  documentCount,
  memberCount,
  onClick,
}: ProjectCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(id);
      }}
      className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-gray-500" />
          <span className="font-semibold">{name}</span>
        </div>
        {isDefault && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            デフォルト
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <FileText className="size-3.5" />
          {documentCount} ドキュメント
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {memberCount} メンバー
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: プロジェクト一覧ページを作成**

```typescript
// src/app/projects/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, FolderOpen } from "lucide-react";
import { ProjectCard } from "@/components/knowledge/project-card";

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  organization_id: string;
  member_count: number;
  document_count: number;
}

async function getAuthToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, userData, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error("[ProjectsPage] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadProjects();
  }, [user, loadProjects]);

  const handleCreate = useCallback(async () => {
    const token = await getAuthToken();
    if (!token || !newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          organization_id: userData?.active_organization_id,
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await loadProjects();
    } catch (err) {
      console.error("[ProjectsPage] Failed to create:", err);
    } finally {
      setCreating(false);
    }
  }, [newName, newDesc, creating, userData, loadProjects]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">ナレッジプロジェクト</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            プロジェクトごとにドキュメントを管理します
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="size-4" />
          新規プロジェクト
        </Button>
      </div>

      {/* 作成フォーム */}
      {showCreate && (
        <div className="mb-6 rounded-lg border p-4">
          <div className="flex flex-col gap-3">
            <Input
              placeholder="プロジェクト名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="プロジェクト名"
            />
            <Input
              placeholder="説明（任意）"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              aria-label="説明"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreate(false)}
              >
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? "作成中..." : "作成"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* プロジェクト一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <FolderOpen className="size-12 text-gray-300" />
          <p className="text-sm text-muted-foreground">
            プロジェクトがありません
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              id={p.id}
              name={p.name}
              description={p.description}
              isDefault={p.is_default}
              documentCount={p.document_count}
              memberCount={p.member_count}
              onClick={(id) => router.push(`/projects/${id}`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/app/projects/page.tsx src/components/knowledge/project-card.tsx
git commit -m "feat(phase3): プロジェクト一覧ページとカードコンポーネントを追加"
```

---

### Task 12: プロジェクト詳細ページ（ドキュメント管理 + D&D）

**Files:**
- Create: `src/app/projects/[id]/page.tsx`
- Create: `src/components/knowledge/document-table.tsx`
- Create: `src/components/knowledge/file-dropzone.tsx`
- Create: `src/components/knowledge/url-input-dialog.tsx`

- [ ] **Step 1: ドラッグ&ドロップ ファイルアップロードコンポーネント**

```typescript
// src/components/knowledge/file-dropzone.tsx
"use client";

import { useCallback, useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  projectId: string;
  token: string;
  onUploadComplete: () => void;
}

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/markdown": "text",
};

export function FileDropzone({ projectId, token, onUploadComplete }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      const sourceType = ACCEPTED_TYPES[file.type] ?? "text";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("title", file.name);
      formData.append("sourceType", sourceType);

      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
    },
    [projectId, token],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      try {
        await Promise.all(Array.from(files).map(uploadFile));
        onUploadComplete();
      } catch (err) {
        console.error("[FileDropzone] Upload error:", err);
      } finally {
        setUploading(false);
      }
    },
    [uploadFile, onUploadComplete],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.docx,.txt,.md"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />
      {uploading ? (
        <Loader2 className="size-8 animate-spin text-gray-400" />
      ) : (
        <Upload className="size-8 text-gray-400" />
      )}
      <div>
        <p className="text-sm font-medium text-gray-600">
          ファイルをドラッグ&ドロップ
        </p>
        <p className="text-xs text-gray-400">
          またはクリックして選択（PDF, DOCX, TXT, MD）
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: URL追加ダイアログ**

```typescript
// src/components/knowledge/url-input-dialog.tsx
"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

interface UrlInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  token: string;
  onSubmit: () => void;
}

export function UrlInputDialog({
  open,
  onOpenChange,
  projectId,
  token,
  onSubmit,
}: UrlInputDialogProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          title: title.trim() || url,
          sourceType: "url",
          sourceUrl: url.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to add URL");
      setUrl("");
      setTitle("");
      onOpenChange(false);
      onSubmit();
    } catch (err) {
      console.error("[UrlInputDialog] Error:", err);
    } finally {
      setSubmitting(false);
    }
  }, [url, title, submitting, projectId, token, onOpenChange, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>URL追加</DialogTitle>
          <DialogDescription>WebページのURLを入力してください</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Input
            placeholder="https://example.com/docs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="URL"
          />
          <Input
            placeholder="タイトル（任意、空欄ならURLを使用）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="タイトル"
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">キャンセル</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !url.trim()}
            >
              {submitting ? "追加中..." : "追加"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: ドキュメント一覧テーブル**

```typescript
// src/components/knowledge/document-table.tsx
"use client";

import { Loader2, Trash2, FileText, Globe, FileType2 } from "lucide-react";
import type { DbKnowledgeDocument } from "@/lib/supabase/types";

interface DocumentTableProps {
  documents: DbKnowledgeDocument[];
  onDelete: (id: string) => void;
  deletingId: string | null;
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  pdf: <FileType2 className="size-3.5 text-amber-600" />,
  docx: <FileType2 className="size-3.5 text-indigo-600" />,
  url: <Globe className="size-3.5 text-blue-600" />,
  text: <FileText className="size-3.5 text-gray-600" />,
};

const SOURCE_BADGE_STYLE: Record<string, string> = {
  pdf: "bg-amber-50 text-amber-700",
  docx: "bg-indigo-50 text-indigo-700",
  url: "bg-blue-50 text-blue-700",
  text: "bg-gray-100 text-gray-700",
};

export function DocumentTable({ documents, onDelete, deletingId }: DocumentTableProps) {
  if (documents.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        ドキュメントがありません
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-4 py-3 font-medium text-gray-600">タイトル</th>
            <th className="px-4 py-3 font-medium text-gray-600">種類</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">チャンク数</th>
            <th className="px-4 py-3 font-medium text-gray-600">状態</th>
            <th className="px-4 py-3 font-medium text-gray-600">追加日</th>
            <th className="px-4 py-3 font-medium text-gray-600"></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-b hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium">{doc.title}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${SOURCE_BADGE_STYLE[doc.source_type] ?? ""}`}>
                  {SOURCE_ICON[doc.source_type]}
                  {doc.source_type.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {doc.status === "ready" ? doc.chunk_count : "—"}
              </td>
              <td className="px-4 py-3">
                {doc.status === "processing" && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Loader2 className="size-3 animate-spin" />
                    処理中
                  </span>
                )}
                {doc.status === "ready" && (
                  <span className="text-green-600">✓ 完了</span>
                )}
                {doc.status === "error" && (
                  <span className="text-red-500" title={doc.error_message ?? ""}>
                    ✕ エラー
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {new Date(doc.created_at).toLocaleDateString("ja-JP")}
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="削除"
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: プロジェクト詳細ページを作成**

```typescript
// src/app/projects/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Link2, Loader2 } from "lucide-react";
import { DocumentTable } from "@/components/knowledge/document-table";
import { FileDropzone } from "@/components/knowledge/file-dropzone";
import { UrlInputDialog } from "@/components/knowledge/url-input-dialog";
import type { DbKnowledgeDocument } from "@/lib/supabase/types";

async function getAuthToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DbKnowledgeDocument[]>([]);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [token, setToken] = useState("");

  const loadData = useCallback(async () => {
    const t = await getAuthToken();
    if (!t) return;
    setToken(t);

    try {
      const [projRes, docsRes] = await Promise.all([
        fetch(`/api/projects/${id}`, {
          headers: { Authorization: `Bearer ${t}` },
        }),
        fetch(`/api/knowledge/documents?projectId=${id}`, {
          headers: { Authorization: `Bearer ${t}` },
        }),
      ]);

      if (projRes.ok) {
        const proj = await projRes.json();
        setProjectName(proj.name);
      }
      if (docsRes.ok) {
        const docs = await docsRes.json();
        setDocuments(docs);
      }
    } catch (err) {
      console.error("[ProjectDetail] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, loadData]);

  // processing状態のドキュメントがあればポーリング
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [documents, loadData]);

  const handleDelete = useCallback(
    async (docId: string) => {
      const t = await getAuthToken();
      if (!t || deletingId) return;
      setDeletingId(docId);
      try {
        await fetch(`/api/knowledge/documents/${docId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${t}` },
        });
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      } catch (err) {
        console.error("[ProjectDetail] Delete error:", err);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId],
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="size-3.5" />
          プロジェクト一覧
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{projectName}</h1>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowUrlDialog(true)}
          >
            <Link2 className="size-4" />
            URL追加
          </Button>
        </div>
      </div>

      {/* ドラッグ&ドロップエリア */}
      <div className="mb-6">
        <FileDropzone
          projectId={id}
          token={token}
          onUploadComplete={loadData}
        />
      </div>

      {/* ドキュメント一覧 */}
      <DocumentTable
        documents={documents}
        onDelete={handleDelete}
        deletingId={deletingId}
      />

      {/* URL追加ダイアログ */}
      <UrlInputDialog
        open={showUrlDialog}
        onOpenChange={setShowUrlDialog}
        projectId={id}
        token={token}
        onSubmit={loadData}
      />
    </main>
  );
}
```

- [ ] **Step 5: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/app/projects/ src/components/knowledge/
git commit -m "feat(phase3): プロジェクト詳細ページ（ドキュメント管理・D&Dアップロード・URL追加）を追加"
```

---

### Task 13: チャットプロジェクトセレクター + 出典表示

**Files:**
- Create: `src/components/knowledge/project-selector.tsx`
- Create: `src/components/chat/citation-display.tsx`
- Modify: `src/app/chat/[id]/page.tsx`

- [ ] **Step 1: プロジェクトセレクター（チェックボックス付きドロップダウン）**

```typescript
// src/components/knowledge/project-selector.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookOpen, ChevronDownIcon } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface ProjectSelectorProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function ProjectSelector({
  selectedIds,
  onSelectionChange,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    })();
  }, []);

  const toggleProject = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((pid) => pid !== id)
        : [...selectedIds, id];
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  if (projects.length === 0) return null;

  const selectedNames = projects
    .filter((p) => selectedIds.includes(p.id))
    .map((p) => p.name);

  const label =
    selectedNames.length > 0
      ? selectedNames.join(", ")
      : "ナレッジ: なし";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={`gap-1 ${selectedIds.length > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
          >
            <BookOpen className="size-4" />
            <span className="max-w-[180px] truncate">{label}</span>
            <ChevronDownIcon className="size-3.5 opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={4} className="w-64">
        <div className="p-2">
          {projects.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => toggleProject(p.id)}
                className="accent-blue-600"
              />
              <span className="flex-1">{p.name}</span>
              {p.is_default && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                  デフォルト
                </span>
              )}
            </label>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: 出典表示コンポーネント**

```typescript
// src/components/chat/citation-display.tsx
"use client";

import { FileText } from "lucide-react";

export interface Citation {
  title: string;
  chunkIndex: number;
}

interface CitationDisplayProps {
  citations: Citation[];
}

export function CitationDisplay({ citations }: CitationDisplayProps) {
  if (citations.length === 0) return null;

  // 同じドキュメントの引用をまとめる
  const grouped = citations.reduce<Record<string, number[]>>((acc, c) => {
    if (!acc[c.title]) acc[c.title] = [];
    acc[c.title].push(c.chunkIndex);
    return acc;
  }, {});

  return (
    <div className="mt-2 border-t pt-2">
      <div className="mb-1 flex items-center gap-1 text-xs text-gray-400">
        <FileText className="size-3" />
        参照元
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(grouped).map(([title, indices]) => (
          <span
            key={title}
            className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
          >
            {title}
            {indices.length > 1 && ` (${indices.length}箇所)`}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: チャットページにプロジェクトセレクターと出典表示を統合**

`src/app/chat/[id]/page.tsx` のツールバーに `<ProjectSelector>` を追加。

チャットストアの `updateTabProjectIds` を使って選択状態を管理。

チャットリクエストの body に `projectIds` を含める。

レスポンスヘッダーの `X-Citations` を読み取り、assistantメッセージの下に `<CitationDisplay>` を表示。

- [ ] **Step 4: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/components/knowledge/project-selector.tsx src/components/chat/citation-display.tsx src/app/chat/
git commit -m "feat(phase3): チャット画面にプロジェクトセレクターと出典表示を追加"
```

---

### Task 14: ヘッダーナビゲーション更新

**Files:**
- Modify: `src/components/layout/header.tsx`

- [ ] **Step 1: ナレッジドロップダウンを追加**

`src/components/layout/header.tsx` のナビゲーションに、チャットと管理者の間に「ナレッジ」ドロップダウンを追加:

```typescript
import { BookOpen } from "lucide-react";

// nav内、チャットドロップダウンの後に追加:
<DropdownMenu>
  <DropdownMenuTrigger
    render={
      <Button variant="ghost" size="sm" className="gap-1">
        <BookOpen className="size-4" />
        <span>ナレッジ</span>
        <ChevronDownIcon className="size-3.5 opacity-50" />
      </Button>
    }
  />
  <DropdownMenuContent align="start" sideOffset={4}>
    <DropdownMenuItem>
      <a href="/projects" className="flex w-full">
        プロジェクト管理
      </a>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Step 2: 型チェック + コミット**

```bash
cd ai-dashboard && npx tsc --noEmit
git add src/components/layout/header.tsx
git commit -m "feat(phase3): ヘッダーにナレッジドロップダウンメニューを追加"
```

---

### Task 15: context.md更新

**Files:**
- Modify: `context/context.md`

- [ ] **Step 1: context.mdにPhase 3aの情報を追加**

- 新規テーブル（projects, project_members, knowledge_documents, document_chunks）
- 新規APIエンドポイント（/api/projects/*, /api/knowledge/documents/*）
- 新規ページ（/projects, /projects/[id]）
- 新規コンポーネント（knowledge/*, chat/citation-display）
- 新規ライブラリモジュール（lib/knowledge/*）
- 環境変数（OPENAI_API_KEY）
- 依存パッケージ（openai, pdf-parse, mammoth, cheerio）
- Phase 3aステータスを「✅ 実装済み」に更新
- 最終更新日を更新

- [ ] **Step 2: コミット**

```bash
git add context/context.md
git commit -m "docs: Phase 3a完了に伴いcontext.mdを更新"
```

---

## Self-Review Checklist

### Spec Coverage
| スペック要件 | 実装タスク |
|-------------|-----------|
| pgvector有効化 | Task 1 |
| projects テーブル | Task 1 |
| project_members テーブル | Task 1 |
| knowledge_documents テーブル | Task 1 |
| document_chunks テーブル | Task 1 |
| sessions.project_ids | Task 1 |
| TypeScript型定義 | Task 1 |
| テキスト抽出 (PDF/DOCX/URL/テキスト) | Task 2 |
| チャンク分割 (500tok, 50tok overlap) | Task 3 |
| エンベディング (OpenAI) | Task 4 |
| 処理パイプライン (非同期) | Task 5 |
| ベクトル検索 (searchKnowledge) | Task 6 |
| プロジェクトCRUD API | Task 7 |
| プロジェクトメンバーAPI | Task 8 |
| ドキュメント管理API (非同期) | Task 9 |
| チャットRAG統合 | Task 10 |
| プロジェクト一覧ページ | Task 11 |
| プロジェクト詳細 (D&D対応) | Task 12 |
| プロジェクトセレクター (チャット) | Task 13 |
| 出典表示 | Task 13 |
| ヘッダーナビゲーション | Task 14 |
| デフォルトプロジェクト | Task 10 (chat route) |
| context.md更新 | Task 15 |

### Type Consistency
- `DbProject` / `DbProjectInsert` / `DbProjectUpdate` — Task 1で定義、Task 7・11で使用 ✓
- `DbKnowledgeDocument` — Task 1で定義、Task 9・12で使用 ✓
- `DbDocumentChunk` — Task 1で定義、Task 5・6で使用 ✓
- `KnowledgeChunk` — Task 6で定義、Task 10で使用 ✓
- `Citation` — Task 13で定義・使用 ✓
- `ExtractInput` — Task 2で定義、Task 5・9で使用 ✓
- `TextChunk` — Task 3で定義、Task 5で使用 ✓
- `searchKnowledge()` — Task 6で定義、Task 10で使用 ✓
- `processDocument()` — Task 5で定義、Task 9で使用 ✓

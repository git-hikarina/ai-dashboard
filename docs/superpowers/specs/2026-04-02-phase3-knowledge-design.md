# Phase 3: ナレッジ — RAG と比較 設計仕様

## 概要

社内AIダッシュボードにドキュメントRAG（Retrieval-Augmented Generation）と同時比較モードを追加する。ドキュメントを「プロジェクト」単位で管理し、チャット時にベクトル検索で関連情報をAIに注入する。

## スコープ

### Phase 3a: ドキュメントRAG
- プロジェクト管理（組織の下に複数プロジェクト）
- ドキュメント登録（テキスト / PDF / Word / URLクロール、ドラッグ&ドロップ対応）
- ベクトル検索（Supabase pgvector）
- チャットへのRAGコンテキスト注入
- セッションごとに複数プロジェクト選択可、デフォルトナレッジ設定

### Phase 3b: 同時比較モード
- 2〜4モデル可変のサイドバイサイド比較
- 全モデル同時ストリーミング
- 回答ダウンロード（PDF / テキスト / Word）

### 後続フェーズで実装（設計のみ先行）
- お気に入り機能（ディレクトリ管理 + マイページ）
- FAQ登録
- 履歴の全文検索・ベクトル検索

---

## アーキテクチャ

### 方式: Supabase pgvector 完結型

すべてSupabase内で完結。エンベディング生成にOpenAI `text-embedding-3-small`（1536次元）を使用。

```
[ドキュメント登録]
ファイル/URL → Next.js API (メタデータ保存、202返却)
           → バックグラウンド処理 (テキスト抽出 → チャンク分割 → エンベディング → DB保存)
           → フロント: ポーリング(5秒)で状態監視

[チャット時]
ユーザー質問 → エンベディング → pgvector類似検索(上位5件) → システムプロンプトに注入 → streamText()
```

### 拡張性

ベクトル検索を `lib/knowledge/search.ts` に抽象化。将来Pinecone等に移行する場合は関数の中身を差し替えるだけで対応可能。

```typescript
// lib/knowledge/search.ts
export async function searchKnowledge(
  query: string,
  projectIds: string[],
  limit?: number
): Promise<KnowledgeChunk[]>
```

---

## データモデル

### 新規テーブル

#### projects
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| organization_id | uuid (FK → organizations) | 所属組織 |
| name | text | プロジェクト名 |
| description | text | 説明 |
| is_default | boolean | デフォルトナレッジフラグ（組織内で1つ） |
| created_by | uuid (FK → users) | 作成者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### project_members
| カラム | 型 | 説明 |
|--------|-----|------|
| project_id | uuid (FK → projects) | |
| user_id | uuid (FK → users) | |
| role | text | "admin" \| "member" |
| created_at | timestamptz | |

複合PK: (project_id, user_id)

#### knowledge_documents
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| project_id | uuid (FK → projects) | 所属プロジェクト |
| title | text | ドキュメント名 |
| source_type | text | "text" \| "pdf" \| "docx" \| "url" |
| source_url | text | URLクロールの場合のURL |
| status | text | "processing" \| "ready" \| "error" |
| error_message | text | エラー時のメッセージ |
| uploaded_by | uuid (FK → users) | アップロード者 |
| chunk_count | integer | チャンク数（処理完了後に設定） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### document_chunks
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| document_id | uuid (FK → knowledge_documents) | 所属ドキュメント |
| chunk_index | integer | チャンク番号 |
| content | text | チャンクのテキスト内容 |
| token_count | integer | トークン数 |
| embedding | vector(1536) | エンベディングベクトル（pgvector） |
| created_at | timestamptz | |

#### favorite_folders（後続フェーズで実装）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 所有ユーザー |
| name | text | フォルダ名 |
| sort_order | integer | 表示順 |
| created_at | timestamptz | |

#### favorite_messages（後続フェーズで実装）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| folder_id | uuid (FK → favorite_folders) | 所属フォルダ |
| message_id | uuid (FK → messages) | お気に入り対象の回答 |
| note | text | ユーザーメモ（任意） |
| created_at | timestamptz | |

### 既存テーブルの変更

#### sessions
- `project_ids uuid[]` を追加 — セッションで選択中のプロジェクトID一覧

### リレーション

```
Organization (1) → (*) Project (1) → (*) KnowledgeDocument (1) → (*) DocumentChunk
                   Project (*) ←→ (*) User (via project_members)
                   Session.project_ids → Project[]
```

---

## ドキュメント処理パイプライン

### 非同期処理フロー

1. `POST /api/knowledge/documents` — メタデータ保存、status: "processing"、202 Accepted を即座に返却
2. バックグラウンドで処理実行（Next.js の `waitUntil` でレスポンス返却後に継続処理）
3. フロント側は5秒間隔のポーリングで状態監視

### テキスト抽出

| ソース | ライブラリ |
|--------|-----------|
| PDF | pdf-parse |
| DOCX | mammoth |
| URL | fetch + cheerio (HTML→テキスト変換) |
| テキスト | そのまま |

### チャンク分割

- サイズ: 約500トークン/チャンク
- オーバーラップ: 前のチャンクと50トークン重複
- 区切り: 段落・改行を優先して自然な位置で分割

### エンベディング

- モデル: OpenAI `text-embedding-3-small`（1536次元）
- バッチ処理: チャンクをまとめてAPI呼び出し
- コスト: 1Mトークンあたり約$0.02（≒¥3）

---

## ベクトル検索とチャット統合

### 検索フロー

1. セッションの `project_ids` を取得
2. `project_ids` が空 → デフォルトプロジェクト（`is_default=true`）を使用
3. デフォルトプロジェクトも存在しない → RAGスキップ、従来通りのチャット
4. ユーザーの質問をエンベディング（OpenAI API）
5. pgvector で類似チャンク検索
   ```sql
   SELECT dc.content, dc.chunk_index, kd.title
   FROM document_chunks dc
   JOIN knowledge_documents kd ON kd.id = dc.document_id
   WHERE kd.project_id = ANY($1)
     AND kd.status = 'ready'
   ORDER BY dc.embedding <=> $2
   LIMIT 5
   ```
6. 検索結果をシステムプロンプトに注入
   ```
   以下の参考情報を踏まえて回答してください：
   ---
   [チャンク内容]
   出典: ドキュメント名
   ---
   ```
7. `streamText()` で通常のチャット処理

### 出典表示

AIの回答の下に、参照したドキュメント名とチャンク位置をバッジで表示。

---

## 同時比較モード

### モード切替

- チャット画面のツールバーに「通常/比較」トグルを追加
- 比較モード時はモデル数（2/3/4）を選択可能
- 各スロットにモデルをドロップダウンで個別選択

### レイアウト

| モデル数 | レイアウト |
|---------|-----------|
| 2 | 左右分割（50:50） |
| 3 | 3カラム（33:33:33） |
| 4 | 2x2グリッド |

### ストリーミング

- 全モデルに同時にリクエスト送信
- 各パネルで独立にストリーミング表示
- 各パネルにモデル名・応答時間・トークン数・コストを表示

### 技術実装

- 比較モード用API: `POST /api/chat/compare`
- リクエストボディに `modelIds: string[]` を含める
- サーバー側で各モデルに対して並列に `streamText()` を実行
- レスポンスはマルチストリーム（各モデルのストリームを識別可能な形式で返却）

### 回答ダウンロード

- 各回答パネルにダウンロードボタン
- 形式選択: PDF / テキスト / Word
- 比較モード時は全回答をまとめてダウンロードも可能

---

## UI設計

### ヘッダーナビゲーション

既存のドロップダウンメニューに「ナレッジ」カテゴリを追加：
- チャット（既存）
- ナレッジ（新規）: プロジェクト管理
- 管理者（既存、admin のみ）

### 画面一覧

#### プロジェクト一覧 — `/projects`
- カード形式でプロジェクトを表示
- プロジェクト名、説明、ドキュメント数、メンバー数
- デフォルトプロジェクトにバッジ表示
- 「新規プロジェクト」ボタン

#### プロジェクト詳細 — `/projects/[id]`
- ドキュメント一覧テーブル（タイトル、種類、チャンク数、状態、追加日）
- 「ファイルアップロード」ボタン + ドラッグ&ドロップ対応
- 「URL追加」ボタン
- 処理中ドキュメントはスピナー表示
- メンバー管理タブ

#### チャット — プロジェクト選択
- ツールバーにプロジェクト選択ドロップダウン（チェックボックス、複数選択可）
- 選択中プロジェクト名を表示
- 未選択時はデフォルトプロジェクトを自動使用

#### チャット — 出典表示
- AI回答の下に「参照元」セクション
- ドキュメント名とチャンク位置をバッジで表示

#### チャット — 比較モード
- 「通常/比較」トグル
- モデル数選択（2/3/4）
- 各モデルのドロップダウン選択
- サイドバイサイドでストリーミング表示
- 各パネルにコスト情報
- ダウンロードボタン

---

## APIエンドポイント

### プロジェクト管理
| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/projects | プロジェクト一覧（ユーザーがアクセス可能なもの） |
| POST | /api/projects | プロジェクト作成 |
| GET | /api/projects/[id] | プロジェクト詳細 |
| PATCH | /api/projects/[id] | プロジェクト更新 |
| DELETE | /api/projects/[id] | プロジェクト削除 |

### プロジェクトメンバー
| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/projects/[id]/members | メンバー一覧 |
| POST | /api/projects/[id]/members | メンバー追加 |
| DELETE | /api/projects/[id]/members/[userId] | メンバー削除 |

### ドキュメント管理
| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/knowledge/documents?projectId=xxx | ドキュメント一覧 |
| POST | /api/knowledge/documents | ドキュメントアップロード（202 Accepted） |
| GET | /api/knowledge/documents/[id] | ドキュメント詳細（ポーリング用） |
| DELETE | /api/knowledge/documents/[id] | ドキュメント削除（チャンクも連鎖削除） |

### ベクトル検索
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/knowledge/search | ベクトル類似検索（チャット内部から呼び出し） |

### 比較モード
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/chat/compare | 複数モデル同時ストリーミング |

### ダウンロード
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/export/message | 回答をPDF/テキスト/Wordでエクスポート |

---

## 環境変数（追加分）

| 変数名 | 説明 |
|--------|------|
| OPENAI_API_KEY | OpenAI Embedding API用 |

---

## マイグレーション

`supabase/migrations/003_phase3_schema.sql` として作成:
- `CREATE EXTENSION IF NOT EXISTS vector` (pgvector有効化)
- `projects` テーブル作成
- `project_members` テーブル作成
- `knowledge_documents` テーブル作成
- `document_chunks` テーブル作成（embedding vector(1536)カラム含む）
- `sessions` に `project_ids uuid[]` カラム追加
- `document_chunks.embedding` にIVFFLATインデックス作成

---

## 依存パッケージ（追加分）

| パッケージ | 用途 |
|-----------|------|
| openai | Embedding API呼び出し |
| pdf-parse | PDFテキスト抽出 |
| mammoth | DOCXテキスト抽出 |
| cheerio | HTMLパース（URLクロール） |
| jspdf | PDF出力（ダウンロード機能） |
| docx | Word出力（ダウンロード機能） |

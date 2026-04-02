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

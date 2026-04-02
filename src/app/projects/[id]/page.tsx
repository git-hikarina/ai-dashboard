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

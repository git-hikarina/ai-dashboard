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

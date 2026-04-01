"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS } from "@/lib/ai/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { DbPreset, PresetScope } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PresetWithPref extends DbPreset {
  is_enabled_by_user: boolean;
}

interface PresetFormData {
  name: string;
  description: string;
  system_prompt: string;
  recommended_model: string;
  icon: string;
  scope: PresetScope;
  team_id: string;
  organization_id: string;
}

const EMPTY_FORM: PresetFormData = {
  name: "",
  description: "",
  system_prompt: "",
  recommended_model: "",
  icon: "",
  scope: "personal",
  team_id: "",
  organization_id: "",
};

const SCOPE_LABELS: Record<PresetScope, string> = {
  personal: "個人",
  team: "チーム",
  organization: "組織",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PresetsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [presets, setPresets] = useState<PresetWithPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetWithPref | null>(null);
  const [form, setForm] = useState<PresetFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<PresetWithPref | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggling state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // -- Fetch presets ----------------------------------------------------------

  const loadPresets = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    setError(null);
    try {
      const res = await fetch("/api/presets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch presets");
      const data = (await res.json()) as PresetWithPref[];
      setPresets(data);
    } catch (err) {
      console.error("[PresetsPage] Failed to load presets:", err);
      setError("プリセットの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadPresets();
  }, [user, loadPresets]);

  // -- Toggle preset ----------------------------------------------------------

  const handleToggle = useCallback(async (preset: PresetWithPref) => {
    const token = await getAuthToken();
    if (!token || togglingId) return;
    setTogglingId(preset.id);
    try {
      const res = await fetch(`/api/presets/${preset.id}/toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Toggle failed");
      setPresets((prev) =>
        prev.map((p) =>
          p.id === preset.id
            ? { ...p, is_enabled_by_user: !p.is_enabled_by_user }
            : p,
        ),
      );
    } catch (err) {
      console.error("[PresetsPage] Toggle error:", err);
    } finally {
      setTogglingId(null);
    }
  }, [togglingId]);

  // -- Open create dialog -----------------------------------------------------

  const openCreateDialog = useCallback(() => {
    setEditingPreset(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  // -- Open edit dialog -------------------------------------------------------

  const openEditDialog = useCallback((preset: PresetWithPref) => {
    setEditingPreset(preset);
    setForm({
      name: preset.name,
      description: preset.description ?? "",
      system_prompt: preset.system_prompt,
      recommended_model: preset.recommended_model ?? "",
      icon: preset.icon ?? "",
      scope: preset.scope,
      team_id: preset.team_id ?? "",
      organization_id: preset.organization_id ?? "",
    });
    setDialogOpen(true);
  }, []);

  // -- Submit form (create / edit) --------------------------------------------

  const handleSubmit = useCallback(async () => {
    const token = await getAuthToken();
    if (!token || submitting) return;

    if (!form.name.trim() || !form.system_prompt.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string | undefined> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        system_prompt: form.system_prompt.trim(),
        recommended_model: form.recommended_model || undefined,
        icon: form.icon.trim() || undefined,
      };

      if (editingPreset) {
        // PATCH — only send editable fields
        const res = await fetch(`/api/presets/${editingPreset.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Update failed");
        const updated = (await res.json()) as DbPreset;
        setPresets((prev) =>
          prev.map((p) =>
            p.id === updated.id
              ? { ...p, ...updated }
              : p,
          ),
        );
      } else {
        // POST — create new preset
        const createBody = {
          ...body,
          scope: form.scope,
          ...(form.scope === "team" && form.team_id
            ? { team_id: form.team_id }
            : {}),
          ...(form.scope === "organization" && form.organization_id
            ? { organization_id: form.organization_id }
            : {}),
        };

        const res = await fetch("/api/presets", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(createBody),
        });
        if (!res.ok) throw new Error("Create failed");
        const created = (await res.json()) as DbPreset;
        setPresets((prev) => [
          ...prev,
          { ...created, is_enabled_by_user: true },
        ]);
      }

      setDialogOpen(false);
      setEditingPreset(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      console.error("[PresetsPage] Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  }, [form, editingPreset, submitting]);

  // -- Delete preset ----------------------------------------------------------

  const handleDelete = useCallback(async () => {
    const token = await getAuthToken();
    if (!token || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/presets/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      setPresets((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error("[PresetsPage] Delete error:", err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting]);

  // -- Group presets by scope -------------------------------------------------

  const grouped = {
    personal: presets.filter((p) => p.scope === "personal"),
    team: presets.filter((p) => p.scope === "team"),
    organization: presets.filter((p) => p.scope === "organization"),
  };

  // -- Auth guard -------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  // -- Render -----------------------------------------------------------------

  return (
    <main className="flex flex-1 flex-col overflow-auto bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/chat")}
          aria-label="チャットに戻る"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold">プリセット管理</h1>
        <div className="flex-1" />
        <Button onClick={openCreateDialog} className="gap-1.5">
          <Plus className="size-4" />
          <span>新しいプリセット作成</span>
        </Button>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={loadPresets}>
              再試行
            </Button>
          </div>
        ) : presets.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              プリセットがありません。新しいプリセットを作成してください。
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {(
              ["personal", "team", "organization"] as const
            ).map((scope) => {
              const items = grouped[scope];
              if (items.length === 0) return null;
              return (
                <section key={scope}>
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {SCOPE_LABELS[scope]}
                    </h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <Separator className="mb-3" />
                  <ul className="space-y-2">
                    {items.map((preset) => (
                      <PresetRow
                        key={preset.id}
                        preset={preset}
                        toggling={togglingId === preset.id}
                        onToggle={() => handleToggle(preset)}
                        onEdit={() => openEditDialog(preset)}
                        onDelete={() => setDeleteTarget(preset)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPreset ? "プリセットを編集" : "新しいプリセット作成"}
            </DialogTitle>
            <DialogDescription>
              {editingPreset
                ? "プリセットの内容を変更します。"
                : "AIチャットで使用するプリセットを作成します。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="preset-name" className="text-sm font-medium">
                名前 <span className="text-destructive">*</span>
              </label>
              <Input
                id="preset-name"
                placeholder="例: コードレビュー用"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="preset-desc" className="text-sm font-medium">
                説明
              </label>
              <Input
                id="preset-desc"
                placeholder="例: コードレビューに特化したプリセット"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            {/* System Prompt */}
            <div className="space-y-1.5">
              <label htmlFor="preset-prompt" className="text-sm font-medium">
                システムプロンプト <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="preset-prompt"
                placeholder="AIへの指示を入力..."
                rows={5}
                value={form.system_prompt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, system_prompt: e.target.value }))
                }
              />
            </div>

            {/* Recommended Model */}
            <div className="space-y-1.5">
              <label htmlFor="preset-model" className="text-sm font-medium">
                推奨モデル
              </label>
              <select
                id="preset-model"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.recommended_model}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    recommended_model: e.target.value,
                  }))
                }
              >
                <option value="">指定なし</option>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <label htmlFor="preset-icon" className="text-sm font-medium">
                アイコン
              </label>
              <Input
                id="preset-icon"
                placeholder="例: 🔍 または code-review"
                value={form.icon}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icon: e.target.value }))
                }
              />
            </div>

            {/* Scope — only shown when creating */}
            {!editingPreset && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="preset-scope" className="text-sm font-medium">
                    スコープ <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="preset-scope"
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={form.scope}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scope: e.target.value as PresetScope,
                      }))
                    }
                  >
                    <option value="personal">個人</option>
                    <option value="team">チーム</option>
                    <option value="organization">組織</option>
                  </select>
                </div>

                {form.scope === "team" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="preset-team-id"
                      className="text-sm font-medium"
                    >
                      チームID <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="preset-team-id"
                      placeholder="チームIDを入力"
                      value={form.team_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, team_id: e.target.value }))
                      }
                    />
                  </div>
                )}

                {form.scope === "organization" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="preset-org-id"
                      className="text-sm font-medium"
                    >
                      組織ID <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="preset-org-id"
                      placeholder="組織IDを入力"
                      value={form.organization_id}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          organization_id: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !form.name.trim() ||
                !form.system_prompt.trim() ||
                (!editingPreset &&
                  form.scope === "team" &&
                  !form.team_id.trim()) ||
                (!editingPreset &&
                  form.scope === "organization" &&
                  !form.organization_id.trim())
              }
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : editingPreset ? (
                "保存"
              ) : (
                "作成"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>プリセットを削除</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}」を削除しますか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "削除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ---------------------------------------------------------------------------
// PresetRow — individual preset item
// ---------------------------------------------------------------------------

function PresetRow({
  preset,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  preset: PresetWithPref;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const modelInfo = MODELS.find((m) => m.id === preset.recommended_model);

  return (
    <li className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
      {/* Icon */}
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-base">
        {preset.icon || "📝"}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{preset.name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {SCOPE_LABELS[preset.scope]}
          </Badge>
        </div>
        {preset.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {preset.description}
          </p>
        )}
        {modelInfo && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            推奨: {modelInfo.displayName}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          disabled={toggling}
          aria-label={
            preset.is_enabled_by_user
              ? "プリセットを無効化"
              : "プリセットを有効化"
          }
        >
          {toggling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : preset.is_enabled_by_user ? (
            <ToggleRight className="size-4 text-green-600" />
          ) : (
            <ToggleLeft className="size-4 text-muted-foreground" />
          )}
        </Button>

        {/* Edit — only for personal presets the user owns */}
        {preset.scope === "personal" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label="プリセットを編集"
            className="opacity-0 group-hover:opacity-100"
          >
            <Pencil className="size-3.5" />
          </Button>
        )}

        {/* Delete — only for personal presets the user owns */}
        {preset.scope === "personal" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="プリセットを削除"
            className="opacity-0 group-hover:opacity-100 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

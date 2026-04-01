"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbSession } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionSidebarProps {
  onSessionSelect: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}

async function fetchSessions(token: string): Promise<DbSession[]> {
  const res = await fetch("/api/sessions", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json() as Promise<DbSession[]>;
}

async function createSession(token: string): Promise<DbSession> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "auto" }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json() as Promise<DbSession>;
}

async function deleteSession(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete session");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionSidebar({ onSessionSelect }: SessionSidebarProps) {
  const { user } = useAuth();
  const { activeTabId, openTab, closeTab } = useChatStore();

  const [sessions, setSessions] = useState<DbSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // -- Fetch sessions on mount -----------------------------------------------

  const loadSessions = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const data = await fetchSessions(token);
      setSessions(data);
    } catch (err) {
      console.error("[SessionSidebar] Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSessions();
  }, [user, loadSessions]);

  // -- Create new session ----------------------------------------------------

  const handleCreate = useCallback(async () => {
    const token = await getAuthToken();
    if (!token || creating) return;
    setCreating(true);
    try {
      const session = await createSession(token);
      setSessions((prev) => [session, ...prev]);
      openTab({
        id: session.id,
        title: session.title,
        fixed_model: session.fixed_model,
        mode: session.mode,
      });
      onSessionSelect(session.id);
    } catch (err) {
      console.error("[SessionSidebar] Failed to create session:", err);
    } finally {
      setCreating(false);
    }
  }, [creating, openTab, onSessionSelect]);

  // -- Delete session --------------------------------------------------------

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      const token = await getAuthToken();
      if (!token || deletingId) return;
      setDeletingId(sessionId);
      try {
        await deleteSession(token, sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        closeTab(sessionId);
      } catch (err) {
        console.error("[SessionSidebar] Failed to delete session:", err);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, closeTab],
  );

  // -- Select session --------------------------------------------------------

  const handleSelect = useCallback(
    (session: DbSession) => {
      openTab({
        id: session.id,
        title: session.title,
        fixed_model: session.fixed_model,
        mode: session.mode,
      });
      onSessionSelect(session.id);
    },
    [openTab, onSessionSelect],
  );

  // -- Render ----------------------------------------------------------------

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/30">
      {/* New chat button */}
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          <span>新しいチャット</span>
        </Button>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="px-2 pb-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              セッションがありません
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((session) => {
                const isActive = activeTabId === session.id;
                const isDeleting = deletingId === session.id;

                return (
                  <li key={session.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(session)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleSelect(session);
                      }}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <MessageSquare className="size-4 shrink-0" />
                      <span className="flex-1 truncate">
                        {session.title || "新しいチャット"}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                        onClick={(e) => handleDelete(e, session.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

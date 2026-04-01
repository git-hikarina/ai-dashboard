"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatStore } from "@/stores/chat-store";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { SessionSidebar } from "@/components/chat/session-sidebar";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { ModelSelector } from "@/components/chat/model-selector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionData {
  id: string;
  title: string | null;
  mode: string;
  fixed_model: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    model_used: string | null;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated");
  return token;
}

/** Convert DB messages to UIMessage format (parts-based). */
function toUIMessages(
  dbMessages: SessionData["messages"],
): UIMessage[] {
  return dbMessages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

/** Extract plain text content from a UIMessage's parts. */
function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { openTab, activeTabId, tabs, updateTabModel } = useChatStore();

  // -- Local state -----------------------------------------------------------

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Derive model from store tab or session data
  const activeTab = tabs.find((t) => t.sessionId === sessionId);
  const modelId = activeTab?.modelId ?? sessionData?.fixed_model ?? DEFAULT_MODEL_ID;

  // -- Load session data on mount --------------------------------------------

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }

        const data = (await res.json()) as SessionData;
        if (cancelled) return;

        setSessionData(data);

        // Register the tab in the store
        openTab({
          id: data.id,
          title: data.title,
          fixed_model: data.fixed_model,
          mode: data.mode,
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load session",
          );
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, sessionId, openTab]);

  // -- Build transport with auth headers + extra body fields -----------------

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async () => {
          const token = await getAuthToken();
          return { Authorization: `Bearer ${token}` };
        },
        body: { modelId, sessionId },
      }),
    [modelId, sessionId],
  );

  // -- Compute initial messages from loaded session data ---------------------

  const initialMessages = useMemo(
    () => (sessionData ? toUIMessages(sessionData.messages) : []),
    [sessionData],
  );

  // -- Set up useChat --------------------------------------------------------

  const {
    messages,
    sendMessage,
    status,
    error: chatError,
    setMessages,
    stop,
  } = useChat({
    id: sessionId,
    transport,
    messages: initialMessages,
    onFinish: () => {
      // Auto-generate title for first message exchange
      if (sessionData && !sessionData.title && messages.length >= 2) {
        const firstUserMsg = messages.find((m) => m.role === "user");
        if (firstUserMsg) {
          const text = getTextContent(firstUserMsg);
          const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
          updateSessionTitle(title);
        }
      }
    },
    onError: (err) => {
      console.error("[ChatSession] Stream error:", err);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // -- Handle sending messages -----------------------------------------------

  const handleSend = useCallback(
    async (text: string) => {
      // 1. Persist user message to DB
      try {
        const token = await getAuthToken();
        await fetch("/api/messages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_id: sessionId, content: text }),
        });
      } catch (err) {
        console.error("[ChatSession] Failed to persist user message:", err);
      }

      // 2. Send via useChat (streams AI response)
      sendMessage({ text });
    },
    [sessionId, sendMessage],
  );

  // -- Update session title --------------------------------------------------

  const updateSessionTitle = useCallback(
    async (title: string) => {
      try {
        const token = await getAuthToken();
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        });
        setSessionData((prev) => (prev ? { ...prev, title } : prev));
        useChatStore.getState().updateTabTitle(sessionId, title);
      } catch (err) {
        console.error("[ChatSession] Failed to update session title:", err);
      }
    },
    [sessionId],
  );

  // -- Handle model change ---------------------------------------------------

  const handleModelChange = useCallback(
    (newModelId: string) => {
      updateTabModel(sessionId, newModelId);
    },
    [sessionId, updateTabModel],
  );

  // -- Handle session selection from sidebar ---------------------------------

  const handleSessionSelect = useCallback(
    (id: string) => {
      router.push(`/chat/${id}`);
    },
    [router],
  );

  // -- Convert UIMessages to the format ChatMessages component expects -------

  const displayMessages = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: getTextContent(m),
          modelUsed:
            m.role === "assistant" ? modelId : undefined,
        })),
    [messages, modelId],
  );

  // -- Render: loading / error states ----------------------------------------

  if (authLoading || sessionLoading) {
    return (
      <>
        <SessionSidebar onSessionSelect={handleSessionSelect} />
        <main className="flex flex-1 items-center justify-center bg-white">
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </main>
      </>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  if (loadError) {
    return (
      <>
        <SessionSidebar onSessionSelect={handleSessionSelect} />
        <main className="flex flex-1 flex-col items-center justify-center bg-white">
          <p className="text-sm text-red-600">
            セッションの読み込みに失敗しました: {loadError}
          </p>
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="mt-3 text-sm text-blue-600 underline"
          >
            チャット一覧に戻る
          </button>
        </main>
      </>
    );
  }

  // -- Render: main chat view ------------------------------------------------

  return (
    <>
      <SessionSidebar onSessionSelect={handleSessionSelect} />
      <main className="flex flex-1 flex-col overflow-hidden bg-white">
        {/* Toolbar: model selector */}
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <ModelSelector
            selectedModelId={modelId}
            onModelSelect={handleModelChange}
          />
          <span className="text-xs text-muted-foreground">
            {sessionData?.title ?? "新しいチャット"}
          </span>
          {chatError && (
            <span className="ml-auto text-xs text-red-500">
              エラーが発生しました
            </span>
          )}
        </div>

        {/* Messages */}
        <ChatMessages messages={displayMessages} isLoading={isLoading} />

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </main>
    </>
  );
}

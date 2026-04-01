"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SessionSidebar } from "@/components/chat/session-sidebar";
import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      router.push(`/chat/${sessionId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <>
      <SessionSidebar onSessionSelect={handleSessionSelect} />
      <main className="flex flex-1 flex-col items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
            <MessageSquare className="size-8 text-gray-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              チャットを開始
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              左のサイドバーから新しいチャットを作成するか、
              <br />
              既存のセッションを選択してください。
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

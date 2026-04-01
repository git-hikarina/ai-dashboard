"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function Header() {
  const { user, userData, logout } = useAuth();

  const displayName =
    userData?.display_name ?? user?.displayName ?? user?.email ?? "";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
      <h1 className="text-lg font-semibold tracking-tight">AI Dashboard</h1>

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{displayName}</span>
          <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
            <LogOut className="size-4" />
            <span>ログアウト</span>
          </Button>
        </div>
      )}
    </header>
  );
}

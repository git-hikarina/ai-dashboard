"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  MessageSquare,
  ChevronDownIcon,
  ShieldCheck,
} from "lucide-react";

export function Header() {
  const { user, userData, logout } = useAuth();

  const displayName =
    userData?.display_name ?? user?.displayName ?? user?.email ?? "";

  const isAdmin =
    userData?.role === "system_admin" || userData?.role === "org_admin";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold tracking-tight">AI Dashboard</h1>

        {user && (
          <nav className="flex items-center gap-1">
            {/* チャット系 */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="gap-1">
                    <MessageSquare className="size-4" />
                    <span>チャット</span>
                    <ChevronDownIcon className="size-3.5 opacity-50" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" sideOffset={4}>
                <DropdownMenuItem>
                  <a href="/chat" className="flex w-full">
                    チャット
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <a href="/chat/presets" className="flex w-full">
                    プリセット管理
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 管理者系（admin以上のみ） */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" className="gap-1">
                      <ShieldCheck className="size-4" />
                      <span>管理者</span>
                      <ChevronDownIcon className="size-3.5 opacity-50" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" sideOffset={4}>
                  <DropdownMenuItem>
                    <a href="/admin/usage" className="flex w-full">
                      利用状況
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <a href="/admin/pricing" className="flex w-full">
                      モデル単価
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        )}
      </div>

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

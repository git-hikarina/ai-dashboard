"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase/client";
import type { UserRole } from "@/lib/supabase/types";

interface AdminUser {
  role: UserRole;
  teamMemberships: Array<{ team_id: string; role: string }>;
  orgMemberships: Array<{ organization_id: string; role: string }>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    async function checkPermission() {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("No token");

        // Use auth/sync endpoint to get user role
        const res = await fetch("/api/auth/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (data.role === "member") {
          router.push("/chat");
          return;
        }

        setAdminUser(data);
      } catch {
        router.push("/chat");
      } finally {
        setChecking(false);
      }
    }

    checkPermission();
  }, [user, loading, router]);

  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">権限を確認中...</p>
      </div>
    );
  }

  if (!adminUser) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 border-r bg-gray-50 p-4">
        <h2 className="mb-4 text-lg font-semibold">管理者</h2>
        <ul className="space-y-1">
          <li>
            <a
              href="/admin/usage"
              className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
            >
              利用状況
            </a>
          </li>
          <li>
            <a
              href="/admin/pricing"
              className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
            >
              モデル単価
            </a>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

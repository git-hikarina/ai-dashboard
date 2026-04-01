"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "@/lib/firebase/client";
import { PricingTable } from "@/components/admin/pricing-table";
import type { DbModelPricing } from "@/lib/supabase/types";

export default function PricingPage() {
  const [pricing, setPricing] = useState<DbModelPricing[]>([]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPricing = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No token");

      // Fetch pricing data
      const res = await fetch("/api/admin/pricing", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(
          res.status === 403 ? "権限がありません" : "データの取得に失敗しました",
        );
      }

      const data = (await res.json()) as DbModelPricing[];
      setPricing(data);

      // Check if user is system_admin via auth/sync
      const syncRes = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const syncData = await syncRes.json();
      setIsSystemAdmin(syncData.role === "system_admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  const handleUpdate = async (
    id: string,
    data: { input_price_per_1k?: number; output_price_per_1k?: number },
  ) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("No token");

    const res = await fetch(`/api/admin/pricing/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "更新に失敗しました");
    }

    const updated = (await res.json()) as DbModelPricing;
    setPricing((prev) => prev.map((p) => (p.id === id ? updated : p)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">モデル単価管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AIモデルの入出力トークン単価を管理します
        </p>
      </div>
      <PricingTable
        pricing={pricing}
        isSystemAdmin={isSystemAdmin}
        onUpdate={handleUpdate}
      />
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "@/lib/firebase/client";
import { UsageSummaryCards } from "@/components/admin/usage-summary-cards";
import { UsageDailyChart } from "@/components/admin/usage-daily-chart";
import { UsageByUserTable } from "@/components/admin/usage-by-user-table";
import { UsageByModelTable } from "@/components/admin/usage-by-model-table";

interface UsageSummary {
  period: string;
  totalCost: number;
  totalRequests: number;
  activeUsers: number;
  budget: { amount: number; orgName: string } | null;
  byUser: Array<{
    userId: string;
    displayName: string;
    requests: number;
    cost: number;
    topModel: string | null;
  }>;
  byModel: Array<{
    modelId: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

interface DailyDataPoint {
  date: string;
  total: number;
  [model: string]: string | number;
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const fetchData = useCallback(async (selectedPeriod: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No token");

      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, dailyRes] = await Promise.all([
        fetch(`/api/admin/usage?period=${selectedPeriod}`, { headers }),
        fetch(`/api/admin/usage/daily?period=${selectedPeriod}`, { headers }),
      ]);

      if (!summaryRes.ok || !dailyRes.ok) {
        throw new Error(
          summaryRes.status === 403 || dailyRes.status === 403
            ? "権限がありません"
            : "データの取得に失敗しました",
        );
      }

      const [summaryData, dailyData] = await Promise.all([
        summaryRes.json() as Promise<UsageSummary>,
        dailyRes.json() as Promise<DailyDataPoint[]>,
      ]);

      setSummary(summaryData);
      setDaily(dailyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  function handlePeriodChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (/^\d{4}-\d{2}$/.test(value)) {
      setPeriod(value);
    }
  }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">利用状況</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AIモデルの利用状況を確認します
          </p>
        </div>
        <div>
          <label htmlFor="period-input" className="sr-only">
            対象月
          </label>
          <input
            id="period-input"
            type="month"
            value={period}
            onChange={handlePeriodChange}
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="対象月を選択"
          />
        </div>
      </div>

      {summary && (
        <>
          <UsageSummaryCards
            totalCost={summary.totalCost}
            totalRequests={summary.totalRequests}
            activeUsers={summary.activeUsers}
            budget={summary.budget}
          />

          <UsageDailyChart data={daily} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <UsageByUserTable data={summary.byUser} />
            <UsageByModelTable data={summary.byModel} />
          </div>
        </>
      )}
    </div>
  );
}

"use client";

interface UsageSummaryCardsProps {
  totalCost: number;
  totalRequests: number;
  activeUsers: number;
  budget: { amount: number; orgName: string } | null;
}

export function UsageSummaryCards({
  totalCost,
  totalRequests,
  activeUsers,
  budget,
}: UsageSummaryCardsProps) {
  const budgetPercent = budget ? Math.min((totalCost / budget.amount) * 100, 100) : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total cost */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-500">合計コスト</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          ¥{totalCost.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {/* Budget progress */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-500">予算消化率</p>
        {budget && budgetPercent !== null ? (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {budgetPercent.toFixed(1)}%
            </p>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200"
              role="progressbar"
              aria-valuenow={budgetPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="予算消化率"
            >
              <div
                className={`h-full rounded-full transition-all ${
                  budgetPercent >= 90
                    ? "bg-red-500"
                    : budgetPercent >= 70
                      ? "bg-yellow-500"
                      : "bg-blue-500"
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              予算: ¥{budget.amount.toLocaleString("ja-JP")} ({budget.orgName})
            </p>
          </>
        ) : (
          <p className="mt-1 text-lg text-gray-400">予算未設定</p>
        )}
      </div>

      {/* Requests count */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-500">リクエスト数</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {totalRequests.toLocaleString("ja-JP")}
        </p>
      </div>

      {/* Active users */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-500">アクティブユーザー</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {activeUsers.toLocaleString("ja-JP")}
        </p>
      </div>
    </div>
  );
}

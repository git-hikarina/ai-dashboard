"use client";

interface UserUsage {
  userId: string;
  displayName: string;
  requests: number;
  cost: number;
  topModel: string | null;
}

interface UsageByUserTableProps {
  data: UserUsage[];
}

export function UsageByUserTable({ data }: UsageByUserTableProps) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <h3 className="border-b px-4 py-3 text-sm font-medium text-gray-700">
        ユーザー別利用状況
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600">ユーザー</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">リクエスト数</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">コスト (¥)</th>
              <th className="px-4 py-3 font-medium text-gray-600">よく使うモデル</th>
            </tr>
          </thead>
          <tbody>
            {data.map((user) => (
              <tr key={user.userId} className="border-b hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium">{user.displayName}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {user.requests.toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ¥{user.cost.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  {user.topModel ? (
                    <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {user.topModel}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

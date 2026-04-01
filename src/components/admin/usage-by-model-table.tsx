"use client";

interface ModelUsage {
  modelId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface UsageByModelTableProps {
  data: ModelUsage[];
}

export function UsageByModelTable({ data }: UsageByModelTableProps) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <h3 className="border-b px-4 py-3 text-sm font-medium text-gray-700">
        モデル別利用状況
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600">モデル</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">リクエスト数</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">入力トークン</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">出力トークン</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">コスト (¥)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((model) => (
              <tr key={model.modelId} className="border-b hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium">{model.modelId}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {model.requests.toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {model.inputTokens.toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {model.outputTokens.toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ¥{model.cost.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
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

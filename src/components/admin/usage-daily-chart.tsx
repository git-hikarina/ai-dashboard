"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DailyDataPoint {
  date: string;
  total: number;
  [model: string]: string | number;
}

interface UsageDailyChartProps {
  data: DailyDataPoint[];
}

const MODEL_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export function UsageDailyChart({ data }: UsageDailyChartProps) {
  // Extract unique model keys (everything except "date" and "total")
  const modelKeys = Array.from(
    new Set(
      data.flatMap((d) =>
        Object.keys(d).filter((k) => k !== "date" && k !== "total"),
      ),
    ),
  );

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-white">
        <p className="text-sm text-gray-400">データがありません</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-gray-700">日別コスト推移</h3>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(value: string) => value.slice(5)} // "MM-DD"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value: number) => `¥${value}`}
          />
          <Tooltip
            formatter={(value, name) => [
              `¥${Number(value).toFixed(2)}`,
              name === "total" ? "合計" : String(name),
            ]}
            labelFormatter={(label) => `日付: ${String(label)}`}
          />
          <Legend />
          {modelKeys.map((model, i) => (
            <Area
              key={model}
              type="monotone"
              dataKey={model}
              stackId="1"
              stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
              fill={MODEL_COLORS[i % MODEL_COLORS.length]}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

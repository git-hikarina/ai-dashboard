"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DbModelPricing } from "@/lib/supabase/types";

interface PricingTableProps {
  pricing: DbModelPricing[];
  isSystemAdmin: boolean;
  onUpdate: (
    id: string,
    data: { input_price_per_1k?: number; output_price_per_1k?: number },
  ) => Promise<void>;
}

export function PricingTable({
  pricing,
  isSystemAdmin,
  onUpdate,
}: PricingTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editOutput, setEditOutput] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(item: DbModelPricing) {
    setEditingId(item.id);
    setEditInput(String(item.input_price_per_1k));
    setEditOutput(String(item.output_price_per_1k));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditInput("");
    setEditOutput("");
  }

  async function handleSave(id: string) {
    setSaving(true);
    try {
      await onUpdate(id, {
        input_price_per_1k: parseFloat(editInput),
        output_price_per_1k: parseFloat(editOutput),
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-4 py-3 font-medium text-gray-600">
              プロバイダー
            </th>
            <th className="px-4 py-3 font-medium text-gray-600">モデル名</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">
              入力単価 (1K tokens)
            </th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">
              出力単価 (1K tokens)
            </th>
            <th className="px-4 py-3 font-medium text-gray-600">最終更新</th>
            {isSystemAdmin && (
              <th className="px-4 py-3 font-medium text-gray-600">操作</th>
            )}
          </tr>
        </thead>
        <tbody>
          {pricing.map((item) => (
            <tr key={item.id} className="border-b hover:bg-gray-50/50">
              <td className="px-4 py-3">
                <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {item.provider}
                </span>
              </td>
              <td className="px-4 py-3 font-medium">{item.display_name}</td>
              <td className="px-4 py-3 text-right">
                {editingId === item.id ? (
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    className="ml-auto w-28 text-right"
                    aria-label="入力単価"
                  />
                ) : (
                  <span className="tabular-nums">
                    ¥{parseFloat(item.input_price_per_1k.toFixed(4))}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {editingId === item.id ? (
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={editOutput}
                    onChange={(e) => setEditOutput(e.target.value)}
                    className="ml-auto w-28 text-right"
                    aria-label="出力単価"
                  />
                ) : (
                  <span className="tabular-nums">
                    ¥{parseFloat(item.output_price_per_1k.toFixed(4))}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {new Date(item.updated_at).toLocaleDateString("ja-JP")}
              </td>
              {isSystemAdmin && (
                <td className="px-4 py-3">
                  {editingId === item.id ? (
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        onClick={() => handleSave(item.id)}
                        disabled={saving}
                      >
                        {saving ? "保存中..." : "保存"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        取消
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => startEdit(item)}
                    >
                      編集
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {pricing.length === 0 && (
            <tr>
              <td
                colSpan={isSystemAdmin ? 6 : 5}
                className="px-4 py-8 text-center text-gray-400"
              >
                モデル単価データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

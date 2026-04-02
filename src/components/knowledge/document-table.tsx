"use client";

import { Loader2, Trash2, FileText, Globe, FileType2 } from "lucide-react";
import type { DbKnowledgeDocument } from "@/lib/supabase/types";

interface DocumentTableProps {
  documents: DbKnowledgeDocument[];
  onDelete: (id: string) => void;
  deletingId: string | null;
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  pdf: <FileType2 className="size-3.5 text-amber-600" />,
  docx: <FileType2 className="size-3.5 text-indigo-600" />,
  url: <Globe className="size-3.5 text-blue-600" />,
  text: <FileText className="size-3.5 text-gray-600" />,
};

const SOURCE_BADGE_STYLE: Record<string, string> = {
  pdf: "bg-amber-50 text-amber-700",
  docx: "bg-indigo-50 text-indigo-700",
  url: "bg-blue-50 text-blue-700",
  text: "bg-gray-100 text-gray-700",
};

export function DocumentTable({ documents, onDelete, deletingId }: DocumentTableProps) {
  if (documents.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        ドキュメントがありません
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-4 py-3 font-medium text-gray-600">タイトル</th>
            <th className="px-4 py-3 font-medium text-gray-600">種類</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">チャンク数</th>
            <th className="px-4 py-3 font-medium text-gray-600">状態</th>
            <th className="px-4 py-3 font-medium text-gray-600">追加日</th>
            <th className="px-4 py-3 font-medium text-gray-600"></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-b hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium">{doc.title}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${SOURCE_BADGE_STYLE[doc.source_type] ?? ""}`}>
                  {SOURCE_ICON[doc.source_type]}
                  {doc.source_type.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {doc.status === "ready" ? doc.chunk_count : "—"}
              </td>
              <td className="px-4 py-3">
                {doc.status === "processing" && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Loader2 className="size-3 animate-spin" />
                    処理中
                  </span>
                )}
                {doc.status === "ready" && (
                  <span className="text-green-600">✓ 完了</span>
                )}
                {doc.status === "error" && (
                  <span className="text-red-500" title={doc.error_message ?? ""}>
                    ✕ エラー
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {new Date(doc.created_at).toLocaleDateString("ja-JP")}
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="削除"
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

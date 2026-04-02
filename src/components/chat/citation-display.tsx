"use client";

import { FileText } from "lucide-react";

export interface Citation {
  title: string;
  chunkIndex: number;
}

interface CitationDisplayProps {
  citations: Citation[];
}

export function CitationDisplay({ citations }: CitationDisplayProps) {
  if (citations.length === 0) return null;

  // 同じドキュメントの引用をまとめる
  const grouped = citations.reduce<Record<string, number[]>>((acc, c) => {
    if (!acc[c.title]) acc[c.title] = [];
    acc[c.title].push(c.chunkIndex);
    return acc;
  }, {});

  return (
    <div className="mt-2 border-t pt-2">
      <div className="mb-1 flex items-center gap-1 text-xs text-gray-400">
        <FileText className="size-3" />
        参照元
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(grouped).map(([title, indices]) => (
          <span
            key={title}
            className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
          >
            {title}
            {indices.length > 1 && ` (${indices.length}箇所)`}
          </span>
        ))}
      </div>
    </div>
  );
}

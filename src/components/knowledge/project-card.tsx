"use client";

import { FolderOpen, FileText, Users } from "lucide-react";

interface ProjectCardProps {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  documentCount: number;
  memberCount: number;
  onClick: (id: string) => void;
}

export function ProjectCard({
  id,
  name,
  description,
  isDefault,
  documentCount,
  memberCount,
  onClick,
}: ProjectCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(id);
      }}
      className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-gray-500" />
          <span className="font-semibold">{name}</span>
        </div>
        {isDefault && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            デフォルト
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <FileText className="size-3.5" />
          {documentCount} ドキュメント
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {memberCount} メンバー
        </span>
      </div>
    </div>
  );
}

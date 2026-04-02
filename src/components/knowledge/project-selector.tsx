"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { BookOpen } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface ProjectSelectorProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function ProjectSelector({
  selectedIds,
  onSelectionChange,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    })();
  }, []);

  const toggleProject = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((pid) => pid !== id)
        : [...selectedIds, id];
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  if (projects.length === 0) return null;

  const selectedNames = projects
    .filter((p) => selectedIds.includes(p.id))
    .map((p) => p.name);

  const label =
    selectedNames.length > 0
      ? selectedNames.join(", ")
      : "ナレッジ: なし";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={`gap-1 ${selectedIds.length > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
          >
            <BookOpen className="size-4" />
            <span className="max-w-[180px] truncate">{label}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={4}>
        {projects.map((p) => (
          <DropdownMenuCheckboxItem
            key={p.id}
            checked={selectedIds.includes(p.id)}
            onCheckedChange={() => toggleProject(p.id)}
          >
            <span className="flex-1">{p.name}</span>
            {p.is_default && (
              <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                デフォルト
              </span>
            )}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";

interface Preset {
  id: string;
  name: string;
  icon: string | null;
  scope: string;
  recommended_model: string | null;
  is_enabled_by_user: boolean;
}

interface PresetSelectorProps {
  selectedPresetId: string | null;
  onPresetSelect: (presetId: string | null, recommendedModel: string | null) => void;
}

export function PresetSelector({
  selectedPresetId,
  onPresetSelect,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch("/api/presets", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPresets(data.filter((p: Preset) => p.is_enabled_by_user));
        }
      } catch (err) {
        console.error("[PresetSelector] Failed to load presets:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selected = presets.find((p) => p.id === selectedPresetId);

  if (loading || presets.length === 0) return null;

  const scopeLabels: Record<string, string> = {
    personal: "個人",
    team: "チーム",
    organization: "組織",
  };

  const grouped = presets.reduce<Record<string, Preset[]>>((acc, p) => {
    const key = p.scope;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <SparklesIcon className="size-3.5" />
            <span className="truncate max-w-[120px]">
              {selected ? `${selected.icon ?? ""} ${selected.name}`.trim() : "プリセット"}
            </span>
            <ChevronDownIcon className="size-3.5 opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuItem
          onSelect={() => onPresetSelect(null, null)}
          className="text-muted-foreground"
        >
          なし（プリセット解除）
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {Object.entries(grouped).map(([scope, items]) => (
          <DropdownMenuGroup key={scope}>
            <DropdownMenuLabel>{scopeLabels[scope] ?? scope}</DropdownMenuLabel>
            {items.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onSelect={() => onPresetSelect(preset.id, preset.recommended_model)}
              >
                {preset.icon && <span className="mr-1.5">{preset.icon}</span>}
                {preset.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

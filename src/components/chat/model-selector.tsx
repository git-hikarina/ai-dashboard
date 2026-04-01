"use client";

import { MODELS, getModelById, type ModelInfo } from "@/lib/ai/models";
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
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon } from "lucide-react";

interface ModelSelectorProps {
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  xai: "xAI",
};

const TIER_LABELS: Record<string, string> = {
  light: "Light",
  standard: "Standard",
  heavy: "Heavy",
};

const TIER_COLORS: Record<string, string> = {
  light: "bg-green-100 text-green-700",
  standard: "bg-blue-100 text-blue-700",
  heavy: "bg-purple-100 text-purple-700",
};

function groupModelsByProvider(): Record<string, ModelInfo[]> {
  const groups: Record<string, ModelInfo[]> = {};
  for (const model of MODELS) {
    if (!groups[model.provider]) {
      groups[model.provider] = [];
    }
    groups[model.provider].push(model);
  }
  return groups;
}

export function ModelSelector({
  selectedModelId,
  onModelSelect,
}: ModelSelectorProps) {
  const selectedModel = getModelById(selectedModelId);
  const groups = groupModelsByProvider();
  const providerKeys = Object.keys(groups);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="gap-2">
            <span className="truncate">
              {selectedModel?.displayName ?? "モデルを選択"}
            </span>
            {selectedModel && (
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TIER_COLORS[selectedModel.tier]}`}
              >
                {TIER_LABELS[selectedModel.tier]}
              </span>
            )}
            <ChevronDownIcon className="size-4 opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={4}>
        {providerKeys.map((provider, index) => (
          <div key={provider}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {PROVIDER_LABELS[provider] ?? provider}
              </DropdownMenuLabel>
              {groups[provider].map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => onModelSelect(model.id)}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">{model.displayName}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TIER_COLORS[model.tier]}`}
                  >
                    {TIER_LABELS[model.tier]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

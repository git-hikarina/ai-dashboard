"use client";

interface CostDisplayProps {
  message: string | null;
  estimatedCost: number | null;
}

export function CostDisplay({ message, estimatedCost }: CostDisplayProps) {
  if (!message) return null;

  const colorClass =
    estimatedCost !== null && estimatedCost > 1000
      ? "text-red-500"
      : estimatedCost !== null && estimatedCost > 500
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <div className={`px-4 pb-1 text-xs ${colorClass}`}>
      {message}
    </div>
  );
}

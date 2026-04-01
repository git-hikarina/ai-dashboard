"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CostConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  estimatedCost: number;
  maxCost: number;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  requiresApproval: boolean;
}

export function CostConfirmDialog({
  open,
  onConfirm,
  onCancel,
  estimatedCost,
  maxCost,
  modelName,
  inputTokens,
  outputTokens,
  requiresApproval,
}: CostConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {requiresApproval ? "管理者承認が必要です" : "コスト確認"}
          </DialogTitle>
          <DialogDescription>
            {requiresApproval
              ? "このリクエストは推定コストが ¥1,000 を超えているため、管理者の承認が必要です。"
              : "このリクエストの推定コストが ¥500 を超えています。"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">モデル</span>
            <span className="font-medium">{modelName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">推定入力トークン</span>
            <span>{inputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">推定出力トークン</span>
            <span>{outputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">推定コスト</span>
            <span className="font-bold text-amber-600">
              ¥{Math.round(estimatedCost).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">最大コスト</span>
            <span className="text-xs text-muted-foreground">
              ¥{Math.round(maxCost).toLocaleString()}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={onConfirm}>
            {requiresApproval ? "承認リクエストを送信" : "送信する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

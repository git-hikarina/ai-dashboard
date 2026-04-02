"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

interface UrlInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  token: string;
  onSubmit: () => void;
}

export function UrlInputDialog({
  open,
  onOpenChange,
  projectId,
  token,
  onSubmit,
}: UrlInputDialogProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          title: title.trim() || url,
          sourceType: "url",
          sourceUrl: url.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to add URL");
      setUrl("");
      setTitle("");
      onOpenChange(false);
      onSubmit();
    } catch (err) {
      console.error("[UrlInputDialog] Error:", err);
    } finally {
      setSubmitting(false);
    }
  }, [url, title, submitting, projectId, token, onOpenChange, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>URL追加</DialogTitle>
          <DialogDescription>WebページのURLを入力してください</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Input
            placeholder="https://example.com/docs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="URL"
          />
          <Input
            placeholder="タイトル（任意、空欄ならURLを使用）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="タイトル"
          />
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="ghost" size="sm" />}>
              キャンセル
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !url.trim()}
            >
              {submitting ? "追加中..." : "追加"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

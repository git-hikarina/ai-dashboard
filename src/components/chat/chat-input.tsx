"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SendHorizontal } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  isLoading,
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue("");
    // Re-focus the textarea after sending
    textareaRef.current?.focus();
  }, [value, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const isDisabled = isLoading || disabled;

  return (
    <div className="border-t bg-white p-4">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力..."
          disabled={isDisabled}
          className="min-h-10 max-h-32 resize-none"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={isDisabled || !value.trim()}
          size="icon"
          className="shrink-0"
        >
          <SendHorizontal className="size-4" />
          <span className="sr-only">送信</span>
        </Button>
      </div>
    </div>
  );
}

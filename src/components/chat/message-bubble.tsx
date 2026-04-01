"use client";

import { cn } from "@/lib/utils";
import { User, Bot } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
  createdAt?: string;
}

export function MessageBubble({
  role,
  content,
  modelUsed,
  createdAt,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-blue-100 text-blue-600"
            : "bg-gray-100 text-gray-600"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5",
          isUser
            ? "rounded-tr-md bg-blue-600 text-white"
            : "rounded-tl-md bg-gray-100 text-gray-900"
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {content}
        </p>

        {/* Footer: model name and/or timestamp */}
        {(modelUsed || createdAt) && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-2 text-[11px]",
              isUser ? "text-blue-200" : "text-gray-400"
            )}
          >
            {modelUsed && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  isUser
                    ? "bg-blue-500/30 text-blue-100"
                    : "bg-gray-200 text-gray-500"
                )}
              >
                {modelUsed}
              </span>
            )}
            {createdAt && <span>{createdAt}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

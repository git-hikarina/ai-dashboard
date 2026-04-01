"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
        <span className="text-xs font-medium">AI</span>
      </div>
      <div className="rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
          <span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
          <span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <ScrollArea className="flex-1 overflow-hidden">
      <div className="flex flex-col gap-4 p-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
            メッセージはまだありません。会話を始めましょう。
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            modelUsed={msg.modelUsed}
          />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

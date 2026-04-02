"use client";

import { useCallback, useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  projectId: string;
  token: string;
  onUploadComplete: () => void;
}

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/markdown": "text",
};

export function FileDropzone({ projectId, token, onUploadComplete }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      const sourceType = ACCEPTED_TYPES[file.type] ?? "text";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("title", file.name);
      formData.append("sourceType", sourceType);

      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
    },
    [projectId, token],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      try {
        await Promise.all(Array.from(files).map(uploadFile));
        onUploadComplete();
      } catch (err) {
        console.error("[FileDropzone] Upload error:", err);
      } finally {
        setUploading(false);
      }
    },
    [uploadFile, onUploadComplete],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.docx,.txt,.md"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />
      {uploading ? (
        <Loader2 className="size-8 animate-spin text-gray-400" />
      ) : (
        <Upload className="size-8 text-gray-400" />
      )}
      <div>
        <p className="text-sm font-medium text-gray-600">
          ファイルをドラッグ&amp;ドロップ
        </p>
        <p className="text-xs text-gray-400">
          またはクリックして選択（PDF, DOCX, TXT, MD）
        </p>
      </div>
    </div>
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";
import { processDocument } from "@/lib/knowledge/pipeline";
import type { ExtractInput } from "@/lib/knowledge/extractor";

// GET: ドキュメント一覧
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: ドキュメントアップロード（非同期処理）
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const contentType = request.headers.get("content-type") ?? "";

    let projectId: string;
    let title: string;
    let sourceType: string;
    let sourceUrl: string | null = null;
    let extractInput: ExtractInput;

    if (contentType.includes("multipart/form-data")) {
      // ファイルアップロード
      const formData = await request.formData();
      projectId = formData.get("projectId") as string;
      title = formData.get("title") as string;
      sourceType = formData.get("sourceType") as string;
      const file = formData.get("file") as File;

      if (!file || !projectId) {
        return NextResponse.json(
          { error: "file と projectId は必須です" },
          { status: 400 },
        );
      }

      title = title || file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      if (sourceType === "pdf") {
        extractInput = { type: "pdf", buffer };
      } else if (sourceType === "docx") {
        extractInput = { type: "docx", buffer };
      } else {
        extractInput = { type: "text", content: buffer.toString("utf-8") };
      }
    } else {
      // JSON (テキストまたはURL)
      const body = await request.json();
      projectId = body.projectId;
      title = body.title;
      sourceType = body.sourceType;
      sourceUrl = body.sourceUrl ?? null;

      if (!projectId || !title || !sourceType) {
        return NextResponse.json(
          { error: "projectId, title, sourceType は必須です" },
          { status: 400 },
        );
      }

      if (sourceType === "url") {
        if (!sourceUrl) {
          return NextResponse.json({ error: "sourceUrl は必須です" }, { status: 400 });
        }
        const res = await fetch(sourceUrl);
        if (!res.ok) {
          return NextResponse.json(
            { error: `URL取得に失敗しました: ${res.status}` },
            { status: 400 },
          );
        }
        const html = await res.text();
        extractInput = { type: "url", html };
      } else {
        extractInput = { type: "text", content: body.content ?? "" };
      }
    }

    // メタデータ保存
    const { data: doc, error } = await supabase
      .from("knowledge_documents")
      .insert({
        project_id: projectId,
        title,
        source_type: sourceType,
        source_url: sourceUrl,
        status: "processing",
        uploaded_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // バックグラウンドで処理（waitUntil が使えない場合はfire-and-forget）
    processDocument(doc.id, extractInput).catch((err) =>
      console.error("[DocumentUpload] Background processing failed:", err),
    );

    return NextResponse.json(doc, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

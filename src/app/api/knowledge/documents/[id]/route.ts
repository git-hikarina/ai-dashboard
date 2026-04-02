import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET: ドキュメント詳細（ポーリング用）
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "ドキュメントが見つかりません" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE: ドキュメント削除（チャンクもCASCADE削除）
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("knowledge_documents")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

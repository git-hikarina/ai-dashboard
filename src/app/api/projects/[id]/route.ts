import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET: プロジェクト詳細
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    }

    // アクセス権チェック
    if (!ctx.isSystemAdmin && !ctx.orgIds.includes(data.organization_id)) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH: プロジェクト更新
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const body = await request.json();

    // プロジェクトのadminまたはsystem_adminのみ
    if (!ctx.isSystemAdmin) {
      const { data: member } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", ctx.user.id)
        .single();

      if (member?.role !== "admin") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    const { name, description, is_default } = body;
    const { data, error } = await supabase
      .from("projects")
      .update({ name, description, is_default })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE: プロジェクト削除（チャンク・ドキュメントもCASCADE削除）
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    if (!ctx.isSystemAdmin) {
      const { data: member } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", id)
        .eq("user_id", ctx.user.id)
        .single();

      if (member?.role !== "admin") {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

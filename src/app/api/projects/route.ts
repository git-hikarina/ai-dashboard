import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

// GET: ユーザーがアクセス可能なプロジェクト一覧
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    // プロジェクトメンバーとして参加、またはsystem_adminなら全組織のプロジェクト
    let query = supabase
      .from("projects")
      .select("*, project_members(user_id, role), knowledge_documents(id)")
      .order("created_at", { ascending: false });

    if (ctx.isSystemAdmin) {
      // system_admin: 全プロジェクト
    } else {
      // メンバーとして参加しているプロジェクト or 所属組織のプロジェクト
      const orgIds = ctx.orgIds;
      query = query.in("organization_id", orgIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    // メンバー数・ドキュメント数を計算して返す
    const projects = (data ?? []).map((p: any) => ({
      ...p,
      member_count: p.project_members?.length ?? 0,
      document_count: p.knowledge_documents?.length ?? 0,
      project_members: undefined,
      knowledge_documents: undefined,
    }));

    return NextResponse.json(projects);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: プロジェクト作成
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const body = await request.json();

    const { name, description, organization_id, is_default } = body;
    if (!name || !organization_id) {
      return NextResponse.json(
        { error: "name と organization_id は必須です" },
        { status: 400 },
      );
    }

    // 組織アクセス権チェック
    if (!ctx.isSystemAdmin && !ctx.orgIds.includes(organization_id)) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // プロジェクト作成
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name,
        description: description ?? "",
        organization_id,
        is_default: is_default ?? false,
        created_by: ctx.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // 作成者をadminメンバーとして追加
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: ctx.user.id,
      role: "admin",
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

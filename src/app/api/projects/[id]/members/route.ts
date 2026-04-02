import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// GET: メンバー一覧
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("project_members")
      .select("user_id, role, created_at, users(email, display_name)")
      .eq("project_id", id);

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// POST: メンバー追加
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get("authorization"));
    const supabase = createServiceClient();
    const body = await request.json();

    // project adminまたはsystem_adminのみ
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

    const { user_id, role } = body;
    if (!user_id) {
      return NextResponse.json({ error: "user_id は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("project_members")
      .insert({ project_id: id, user_id, role: role ?? "member" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

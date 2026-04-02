import { NextResponse, type NextRequest } from "next/server";
import { resolveUser } from "@/lib/auth/resolve-user";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; userId: string }> };

// DELETE: メンバー削除
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id, userId } = await params;
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

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", id)
      .eq("user_id", userId);

    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("authorization") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

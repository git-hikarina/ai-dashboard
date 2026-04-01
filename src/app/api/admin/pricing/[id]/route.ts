import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/admin/pricing/[id] — Update model pricing (system_admin only)
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));

    if (!ctx.isSystemAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: system_admin only' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      input_price_per_1k?: number;
      output_price_per_1k?: number;
    };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('model_pricing')
      .update({
        ...(body.input_price_per_1k !== undefined && {
          input_price_per_1k: body.input_price_per_1k,
        }),
        ...(body.output_price_per_1k !== undefined && {
          output_price_per_1k: body.output_price_per_1k,
        }),
        updated_by: ctx.user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

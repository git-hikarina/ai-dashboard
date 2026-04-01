import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/pricing — List all model pricing
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));

    // Any admin role can view
    if (
      !ctx.isSystemAdmin &&
      ctx.orgMemberships.every((o) => o.role !== 'org_admin') &&
      ctx.teamMemberships.every((t) => t.role !== 'owner' && t.role !== 'admin')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('model_pricing')
      .select('*')
      .order('provider')
      .order('display_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

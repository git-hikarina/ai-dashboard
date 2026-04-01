import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// PATCH /api/admin/approval/[id] — Approve or reject a pending usage request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));

    if (!ctx.isSystemAdmin && ctx.orgMemberships.every(o => o.role !== 'org_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as { status: 'admin_approved' | 'rejected' };

    if (!['admin_approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('usage_logs')
      .update({ approval_status: body.status })
      .eq('id', id)
      .eq('approval_status', 'pending')
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

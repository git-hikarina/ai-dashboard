import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/usage/daily?period=2026-04
export async function GET(request: NextRequest) {
  try {
    await resolveUser(request.headers.get('authorization'));
    const period = request.nextUrl.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
    const startDate = `${period}-01T00:00:00Z`;
    const endDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)).toISOString();

    const supabase = createServiceClient();

    const { data: logs, error } = await supabase
      .from('usage_logs')
      .select('model_id, cost_jpy, created_at')
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by date
    const daily: Record<string, Record<string, number>> = {};
    for (const log of logs ?? []) {
      const date = log.created_at.slice(0, 10);
      if (!daily[date]) daily[date] = {};
      daily[date][log.model_id] = (daily[date][log.model_id] ?? 0) + Number(log.cost_jpy);
    }

    const result = Object.entries(daily)
      .map(([date, models]) => ({
        date,
        total: Math.round(Object.values(models).reduce((s, v) => s + v, 0) * 100) / 100,
        ...Object.fromEntries(
          Object.entries(models).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

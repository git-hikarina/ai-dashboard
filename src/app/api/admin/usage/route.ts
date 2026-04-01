import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/usage?period=2026-04
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const period = request.nextUrl.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
    const startDate = `${period}-01T00:00:00Z`;
    const endDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)).toISOString();

    const supabase = createServiceClient();

    const { data: logs, error } = await supabase
      .from('usage_logs')
      .select('user_id, model_id, provider, input_tokens, output_tokens, cost_jpy, created_at')
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get org budget if applicable
    let budget = null;
    if (ctx.user.active_organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('monthly_budget_jpy, name')
        .eq('id', ctx.user.active_organization_id)
        .single();
      budget = org;
    }

    // Aggregate
    const totalCost = (logs ?? []).reduce((sum, l) => sum + Number(l.cost_jpy), 0);
    const totalRequests = (logs ?? []).length;
    const uniqueUsers = new Set((logs ?? []).map((l) => l.user_id)).size;

    // By user
    const byUser: Record<string, { requests: number; cost: number; models: Record<string, number> }> = {};
    for (const log of logs ?? []) {
      if (!byUser[log.user_id]) byUser[log.user_id] = { requests: 0, cost: 0, models: {} };
      byUser[log.user_id].requests++;
      byUser[log.user_id].cost += Number(log.cost_jpy);
      byUser[log.user_id].models[log.model_id] = (byUser[log.user_id].models[log.model_id] ?? 0) + 1;
    }

    // By model
    const byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }> = {};
    for (const log of logs ?? []) {
      if (!byModel[log.model_id]) byModel[log.model_id] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      byModel[log.model_id].requests++;
      byModel[log.model_id].inputTokens += log.input_tokens;
      byModel[log.model_id].outputTokens += log.output_tokens;
      byModel[log.model_id].cost += Number(log.cost_jpy);
    }

    // Fetch user display names
    const userIds = Object.keys(byUser);
    const { data: users } = userIds.length > 0
      ? await supabase.from('users').select('id, display_name, email').in('id', userIds)
      : { data: [] };

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return NextResponse.json({
      period,
      totalCost: Math.round(totalCost * 100) / 100,
      totalRequests,
      activeUsers: uniqueUsers,
      budget: budget ? { amount: Number(budget.monthly_budget_jpy), orgName: budget.name } : null,
      byUser: Object.entries(byUser).map(([userId, data]) => ({
        userId,
        displayName: userMap.get(userId)?.display_name ?? userMap.get(userId)?.email ?? userId,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
        topModel: Object.entries(data.models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      })).sort((a, b) => b.cost - a.cost),
      byModel: Object.entries(byModel).map(([modelId, data]) => ({
        modelId,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
      })).sort((a, b) => b.cost - a.cost),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

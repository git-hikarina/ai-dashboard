import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbPresetInsert, DbUserPresetPreferenceInsert } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// GET /api/presets — List presets available to the authenticated user
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const userId = ctx.user.id;
    const teamIds = ctx.teamIds;
    const orgIds = ctx.orgIds;

    // Use .or() with multiple conditions joined by AND within each group
    let query = supabase
      .from('presets')
      .select('*')
      .eq('is_active', true);

    if (teamIds.length > 0 && orgIds.length > 0) {
      query = query.or(
        `and(scope.eq.personal,owner_id.eq.${userId}),` +
        `and(scope.eq.team,team_id.in.(${teamIds.join(',')})),` +
        `and(scope.eq.organization,organization_id.in.(${orgIds.join(',')}))`
      );
    } else if (teamIds.length > 0) {
      query = query.or(
        `and(scope.eq.personal,owner_id.eq.${userId}),` +
        `and(scope.eq.team,team_id.in.(${teamIds.join(',')}))`
      );
    } else if (orgIds.length > 0) {
      query = query.or(
        `and(scope.eq.personal,owner_id.eq.${userId}),` +
        `and(scope.eq.organization,organization_id.in.(${orgIds.join(',')}))`
      );
    } else {
      query = query.eq('scope', 'personal').eq('owner_id', userId);
    }

    const { data: presets, error: presetsError } = await query;

    if (presetsError) {
      return NextResponse.json({ error: presetsError.message }, { status: 500 });
    }

    if (!presets || presets.length === 0) {
      return NextResponse.json([]);
    }

    const presetIds = presets.map((p) => p.id);

    // Fetch user preferences for these presets
    const { data: preferences, error: prefError } = await supabase
      .from('user_preset_preferences')
      .select('preset_id, is_enabled')
      .eq('user_id', userId)
      .in('preset_id', presetIds);

    if (prefError) {
      return NextResponse.json({ error: prefError.message }, { status: 500 });
    }

    const prefMap = new Map<string, boolean>();
    for (const pref of preferences ?? []) {
      prefMap.set(pref.preset_id, pref.is_enabled);
    }

    const result = presets.map((preset) => ({
      ...preset,
      is_enabled_by_user: prefMap.get(preset.id) ?? false,
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/presets — Create a new preset
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const body = await request.json() as {
      name?: string;
      description?: string;
      system_prompt?: string;
      scope?: string;
      team_id?: string;
      organization_id?: string;
      recommended_model?: string;
      icon?: string;
    };

    // Validate required fields
    if (!body.name || !body.system_prompt || !body.scope) {
      return NextResponse.json(
        { error: 'name, system_prompt, and scope are required' },
        { status: 400 }
      );
    }

    const validScopes = ['personal', 'team', 'organization'] as const;
    if (!validScopes.includes(body.scope as typeof validScopes[number])) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    const scope = body.scope as DbPresetInsert['scope'];

    // Permission checks
    if (scope === 'team') {
      if (!body.team_id) {
        return NextResponse.json({ error: 'team_id is required for team scope' }, { status: 400 });
      }
      if (!ctx.isTeamAdmin(body.team_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (scope === 'organization') {
      if (!body.organization_id) {
        return NextResponse.json({ error: 'organization_id is required for organization scope' }, { status: 400 });
      }
      if (!ctx.isOrgAdmin(body.organization_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const insert: DbPresetInsert = {
      name: body.name,
      description: body.description ?? null,
      system_prompt: body.system_prompt,
      scope,
      owner_id: scope === 'personal' ? ctx.user.id : null,
      team_id: scope === 'team' ? (body.team_id ?? null) : null,
      organization_id: scope === 'organization' ? (body.organization_id ?? null) : null,
      recommended_model: body.recommended_model ?? null,
      icon: body.icon ?? null,
      is_active: true,
    };

    const { data: preset, error: insertError } = await supabase
      .from('presets')
      .insert(insert)
      .select()
      .single();

    if (insertError || !preset) {
      return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 });
    }

    // Auto-enable for creator
    const prefInsert: DbUserPresetPreferenceInsert = {
      user_id: ctx.user.id,
      preset_id: preset.id,
      is_enabled: true,
    };

    await supabase.from('user_preset_preferences').insert(prefInsert);

    return NextResponse.json(preset, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

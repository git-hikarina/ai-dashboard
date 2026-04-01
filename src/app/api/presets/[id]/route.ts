import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbPresetUpdate } from '@/lib/supabase/types';

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/presets/[id] — Fetch single preset by id
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await resolveUser(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: preset, error } = await supabase
      .from('presets')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    return NextResponse.json(preset);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/presets/[id] — Update a preset
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: existing, error: fetchError } = await supabase
      .from('presets')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // Permission check
    if (!ctx.isSystemAdmin) {
      if (existing.scope === 'personal' && existing.owner_id !== ctx.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      } else if (existing.scope === 'team' && !ctx.isTeamAdmin(existing.team_id ?? '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      } else if (existing.scope === 'organization' && !ctx.isOrgAdmin(existing.organization_id ?? '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json() as Partial<Pick<
      DbPresetUpdate,
      'name' | 'description' | 'system_prompt' | 'recommended_model' | 'icon' | 'is_active'
    >>;

    // Only allow updating safe fields
    const update: DbPresetUpdate = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.system_prompt !== undefined) update.system_prompt = body.system_prompt;
    if (body.recommended_model !== undefined) update.recommended_model = body.recommended_model;
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data: updated, error: updateError } = await supabase
      .from('presets')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/presets/[id] — Delete a preset
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: existing, error: fetchError } = await supabase
      .from('presets')
      .select('scope, owner_id, team_id, organization_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // Permission check
    if (!ctx.isSystemAdmin) {
      if (existing.scope === 'personal' && existing.owner_id !== ctx.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      } else if (existing.scope === 'team' && !ctx.isTeamAdmin(existing.team_id ?? '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      } else if (existing.scope === 'organization' && !ctx.isOrgAdmin(existing.organization_id ?? '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { error: deleteError } = await supabase
      .from('presets')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbUserPresetPreferenceInsert } from '@/lib/supabase/types';

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/presets/[id]/toggle — Toggle user's enabled/disabled state
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    // Verify preset exists
    const { data: preset, error: presetError } = await supabase
      .from('presets')
      .select('id')
      .eq('id', id)
      .single();

    if (presetError || !preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    const userId = ctx.user.id;

    // Check if preference row exists
    const { data: existing, error: fetchError } = await supabase
      .from('user_preset_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('preset_id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = "not found" from PostgREST — any other error is unexpected
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (existing) {
      // Toggle existing preference
      const { data: updated, error: updateError } = await supabase
        .from('user_preset_preferences')
        .update({ is_enabled: !existing.is_enabled })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json(updated);
    } else {
      // Create new preference with is_enabled = true
      const insert: DbUserPresetPreferenceInsert = {
        user_id: userId,
        preset_id: id,
        is_enabled: true,
      };

      const { data: created, error: insertError } = await supabase
        .from('user_preset_preferences')
        .insert(insert)
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json(created);
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

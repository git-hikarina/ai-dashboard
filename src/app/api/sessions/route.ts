import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbSessionInsert } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// GET /api/sessions — List the authenticated user's sessions
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const { uid } = await verifyToken(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(sessions);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/sessions — Create a new session
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { uid } = await verifyToken(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await request.json() as {
      title?: string;
      mode?: DbSessionInsert['mode'];
      fixed_model?: string;
    };

    const insert: DbSessionInsert = {
      owner_id: user.id,
      mode: body.mode ?? 'auto',
      title: body.title ?? null,
      fixed_model: body.fixed_model ?? null,
      is_shared: false,
      organization_id: null,
      preset_id: null,
    };

    const { data: session, error } = await supabase
      .from('sessions')
      .insert(insert)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(session, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

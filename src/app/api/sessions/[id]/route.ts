import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbSessionUpdate } from '@/lib/supabase/types';

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/sessions/[id] — Get a session with its messages
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { uid } = await verifyToken(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify ownership or shared access
    if (session.owner_id !== user.id && !session.is_shared) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    return NextResponse.json({ ...session, messages: messages ?? [] });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/sessions/[id] — Partial update of a session
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { uid } = await verifyToken(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('sessions')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as Pick<DbSessionUpdate, 'title' | 'mode' | 'fixed_model'>;

    // Only allow safe fields
    const update: DbSessionUpdate = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.mode !== undefined) update.mode = body.mode;
    if (body.fixed_model !== undefined) update.fixed_model = body.fixed_model;

    const { data: session, error } = await supabase
      .from('sessions')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/sessions/[id] — Delete a session (messages cascade)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { uid } = await verifyToken(request.headers.get('authorization'));
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('sessions')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (existing.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

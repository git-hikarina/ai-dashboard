import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbMessageInsert } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// POST /api/messages — Persist a user message before streaming the AI response
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

    const body = await request.json() as { session_id: string; content: string };

    if (!body.session_id || !body.content) {
      return NextResponse.json(
        { error: 'session_id and content are required' },
        { status: 400 }
      );
    }

    // Verify the session exists and the user owns it
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('owner_id')
      .eq('id', body.session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const insert: DbMessageInsert = {
      session_id: body.session_id,
      role: 'user',
      content: body.content,
      sender_id: user.id,
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      cost_jpy: null,
    };

    const { data: message, error } = await supabase
      .from('messages')
      .insert(insert)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(message, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

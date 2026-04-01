import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { uid, email } = await verifyToken(request.headers.get('authorization'));

    const body = await request.json().catch(() => ({}));
    const displayName = body.displayName || email?.split('@')[0] || '';

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          firebase_uid: uid,
          email: email || '',
          display_name: displayName,
        },
        { onConflict: 'firebase_uid' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

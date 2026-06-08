import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const { rating, type } = await req.json();

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1-5', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const table = type === 'image' ? 'image_runs' : 'concept_runs';
  const { error } = await supabase
    .from(table)
    .update({ quality_rating: rating })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

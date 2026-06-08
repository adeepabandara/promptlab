import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportImageRunsCsv } from '@/lib/csv-export';
import { ImageRun } from '@/types';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('image_runs')
    .select(`*, models(*), prompt_versions(*, prompts(*))`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const csv = exportImageRunsCsv(data as ImageRun[]);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="image-runs.csv"',
    },
  });
}

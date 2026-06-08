import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const service = await createServiceClient();

  // Verify the prompt belongs to the user
  const { data: prompt } = await service
    .from('prompts')
    .select('id')
    .eq('id', body.prompt_id)
    .eq('user_id', user.id)
    .single();

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  }

  const { data, error } = await service.from('prompt_versions').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

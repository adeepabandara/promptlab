import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/render/foam
 *
 * Proxies to the Python render server (render_server.py).
 * Accepts the concept JSON as the body, forwards any query params.
 *
 * Required env var:
 *   PYTHON_RENDER_URL  — base URL of the render server, e.g. http://localhost:5001
 *
 * Optional env var:
 *   PYTHON_RENDER_SECRET — bearer token (must match server RENDER_SECRET)
 *
 * Query params forwarded to render server:
 *   glb_url    — signed/public URL to product GLB
 *   width      — image width px  (default 1600)
 *   height     — image height px (default 1200)
 *   all_views  — '1' to get a zip of all 10 views
 */
export async function POST(req: NextRequest) {
  // Auth — must be a logged-in user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const renderUrl = process.env.PYTHON_RENDER_URL;
  if (!renderUrl) {
    return NextResponse.json(
      { error: 'PYTHON_RENDER_URL is not configured' },
      { status: 503 }
    );
  }

  // Forward body and query params
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const incomingParams = req.nextUrl.searchParams;
  const upstream = new URL(`${renderUrl}/render`);
  incomingParams.forEach((v, k) => upstream.searchParams.set(k, v));

  // Resolve product GLB URL — same logic as FoamVisualizer
  // product_id can come from query param OR from the concept JSON body
  const productId = incomingParams.get('product_id')
    || (body as any)?.meta?.product_id;

  if (productId && !incomingParams.get('glb_url')) {
    try {
      const isUuid = /^[0-9a-f-]{36}$/i.test(productId);
      const { data: product } = isUuid
        ? await supabase.from('products').select('glb_url').eq('id', productId).maybeSingle()
        : await supabase.from('products').select('glb_url').ilike('name', `%${productId}%`).limit(1).maybeSingle();

      if (product?.glb_url) {
        // Try signed URL first, fall back to public URL
        const { data: signed } = await supabase.storage
          .from('generated-images')
          .createSignedUrl(product.glb_url, 3600);
        if (signed?.signedUrl) {
          upstream.searchParams.set('glb_url', signed.signedUrl);
        } else {
          const { data: urlData } = supabase.storage
            .from('generated-images')
            .getPublicUrl(product.glb_url);
          if (urlData?.publicUrl) {
            upstream.searchParams.set('glb_url', urlData.publicUrl);
          }
        }
      }
    } catch (e) {
      console.warn('[render/foam] Could not resolve product GLB:', e);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const secret = process.env.PYTHON_RENDER_SECRET;
  if (secret) headers['Authorization'] = `Bearer ${secret}`;

  let upstream_res: Response;
  try {
    upstream_res = await fetch(upstream.toString(), {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Render server unreachable: ${msg}` },
      { status: 502 }
    );
  }

  if (!upstream_res.ok) {
    const text = await upstream_res.text();
    return NextResponse.json(
      { error: `Render server error ${upstream_res.status}: ${text}` },
      { status: upstream_res.status }
    );
  }

  // Stream the PNG (or zip) directly back to the client
  const contentType = upstream_res.headers.get('content-type') ?? 'image/png';
  const blob = await upstream_res.arrayBuffer();
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}

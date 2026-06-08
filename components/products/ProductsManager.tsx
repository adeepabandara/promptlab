'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function ProductsManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [name, setName]         = useState('');
  const [glbFile, setGlbFile]   = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Product name is required'); return; }
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); setSaving(false); return; }

    // 1 — create product record first (to get the id)
    const { data: product, error: insertErr } = await supabase
      .from('products')
      .insert({ name: name.trim(), user_id: user.id })
      .select()
      .single();

    if (insertErr || !product) {
      console.error('Product insert error:', insertErr);
      toast.error('DB error: ' + (insertErr?.message ?? 'Failed to create product'));
      setSaving(false);
      return;
    }

    // 2 — upload GLB if provided
    if (glbFile) {
      setUploading(true);
      const path = `${user.id}/products/${product.id}/model.glb`;
      console.log('Uploading GLB to path:', path, 'size:', glbFile.size, 'type:', glbFile.type);

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('generated-images')
        .upload(path, glbFile, {
          upsert: true,
          contentType: 'model/gltf-binary',
        });

      console.log('Upload result:', uploadData, uploadErr);

      if (uploadErr) {
        toast.error('Storage error: ' + uploadErr.message);
        setUploading(false);
        setSaving(false);
        return;
      }

      // 3 — save storage path back to product record
      const { error: updateErr } = await supabase
        .from('products')
        .update({ glb_url: path })
        .eq('id', product.id);

      if (updateErr) {
        console.error('glb_url update error:', updateErr);
        toast.error('Failed to save GLB path: ' + updateErr.message);
      }

      setUploading(false);
    }

    toast.success(`Product "${name.trim()}" created`);
    setName('');
    setGlbFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setSaving(false);
    load();
  }

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const supabase = createClient();

    // Remove GLB from storage if present
    if (product.glb_url) {
      await supabase.storage.from('generated-images').remove([product.glb_url]);
    }

    await supabase.from('products').delete().eq('id', product.id);
    toast.success('Product deleted');
    load();
  }

  async function handleReplaceGlb(product: Product, file: File) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const path = `${user.id}/products/${product.id}/model.glb`;
    const { error } = await supabase.storage
      .from('generated-images')
      .upload(path, file, { upsert: true });

    if (error) { toast.error('Upload failed: ' + error.message); return; }

    await supabase.from('products').update({ glb_url: path }).eq('id', product.id);
    toast.success('GLB updated');
    load();
  }

  return (
    <div className="space-y-8">
      {/* Create product form */}
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Add Product</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Product name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grundfos CM5-4 Pump"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              GLB file <span className="normal-case text-gray-300">(optional — 3D model)</span>
            </Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".glb,.gltf"
              onChange={(e) => setGlbFile(e.target.files?.[0] ?? null)}
              disabled={saving}
            />
            {glbFile && (
              <p className="text-xs text-gray-400">
                {glbFile.name} — {(glbFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <Button type="submit" disabled={saving || !name.trim()} className="w-full">
            {uploading ? 'Uploading GLB…' : saving ? 'Creating…' : 'Create Product'}
          </Button>
        </form>
      </div>

      {/* Product list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Products {!loading && <span className="text-gray-400 font-normal">({products.length})</span>}
        </h2>

        {loading && (
          <div className="text-sm text-gray-400">Loading…</div>
        )}

        {!loading && products.length === 0 && (
          <div className="rounded-xl border bg-gray-50 p-8 text-center text-sm text-gray-400">
            No products yet. Add one above.
          </div>
        )}

        {products.map((product) => (
          <div key={product.id} className="rounded-xl border bg-white px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border select-all">
                  {product.id}
                </code>
                {product.glb_url
                  ? <Badge className="text-xs bg-green-100 text-green-700 border-0">GLB ✓</Badge>
                  : <Badge className="text-xs bg-gray-100 text-gray-500 border-0">No GLB</Badge>
                }
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Replace GLB */}
              <label className="cursor-pointer">
                <span className="inline-flex items-center justify-center rounded-md text-xs font-medium px-3 h-8 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                  {product.glb_url ? 'Replace GLB' : 'Upload GLB'}
                </span>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleReplaceGlb(product, f);
                    e.target.value = '';
                  }}
                />
              </label>

              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8"
                onClick={() => handleDelete(product)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

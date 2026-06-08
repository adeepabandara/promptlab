'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FoamVisualizer } from './FoamVisualizer';

interface BlenderRenderProps {
  conceptJson: Record<string, unknown>;
  productId?: string;
}

type Engine = 'EEVEE' | 'CYCLES';

// ── Shared Three.js module cache (same CDN version as FoamVisualizer) ─────────
let _THREE: any = null;
async function getThreeForGlb() {
  if (_THREE) return _THREE;
  // @ts-ignore
  const [threeMod, ocMod, gltfMod] = await Promise.all([
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three@0.160.0'),
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls'),
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader'),
  ]);
  const OrbitControls = ocMod.OrbitControls ?? ocMod.default?.OrbitControls;
  const GLTFLoader    = gltfMod.GLTFLoader   ?? gltfMod.default?.GLTFLoader;
  _THREE = { ...threeMod, OrbitControls, GLTFLoader };
  return _THREE;
}

// ─── Blender GLB Viewer ──────────────────────────────────────────────────────
function BlenderGlbViewer({ glbBlob }: { glbBlob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef   = useRef<(() => void) | null>(null);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState('Initialising Three.js…');

  useEffect(() => {
    if (!containerRef.current || !glbBlob) return;
    const container = containerRef.current;
    let cancelled = false;

    (async () => {
      try {
      setLoadStatus('Loading Three.js…');
      const THREE = await getThreeForGlb();
      const { OrbitControls, GLTFLoader } = THREE;
      if (cancelled) return;
      setLoadStatus('Building scene…');

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf8f8f6);

      // Camera — orthographic isometric matching Blender's camera
      const w = container.clientWidth  || 600;
      const h = container.clientHeight || 480;
      const aspect = w / h;
      const frustum = 800;
      const camera = new THREE.OrthographicCamera(
        -frustum * aspect / 2,  frustum * aspect / 2,
         frustum / 2,          -frustum / 2,
        -100000, 100000
      );
      // Isometric angle: same direction as Blender renderer
      // Blender: pos = centre + (dist, dist*0.82, dist) in Blender coords
      // Three.js (Y-up): (dist, dist, dist*0.82) → normalise
      camera.position.set(1, 1, 0.82).normalize().multiplyScalar(1800);
      camera.lookAt(0, 0, 0);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // Orbit controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      // Lighting — three-point matching Blender setup
      const ambient = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambient);
      const key  = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(1.2, 2.0, 1.0).normalize().multiplyScalar(1000);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.6);
      fill.position.set(-1.1, 1.0, -0.6).normalize().multiplyScalar(800);
      scene.add(fill);
      const rim = new THREE.PointLight(0xffffff, 0.3, 5000);
      rim.position.set(-300, -600, -800);
      scene.add(rim);

      // Verify the blob is actually a GLB (starts with 0x46546C67 "glTF")
      const headerBytes = await glbBlob.slice(0, 4).arrayBuffer();
      const magic = new Uint32Array(headerBytes)[0];
      if (magic !== 0x46546C67) {
        // Not a GLB — likely a PNG returned by old server or an error JSON
        const text = await glbBlob.text();
        const preview = text.slice(0, 200);
        setLoadError(`Response is not a GLB file.\nServer returned: ${preview}`);
        return;
      }

      setLoadStatus('Parsing GLB…');
      const blobUrl = URL.createObjectURL(glbBlob);
      const loader  = new GLTFLoader();
      loader.load(
        blobUrl,
        (gltf: any) => {
          if (cancelled) return;
          URL.revokeObjectURL(blobUrl);
          setLoadStatus('');

          const model = gltf.scene;

          // ── Axis correction ───────────────────────────────────────
          // Our Blender script treats Y as the vertical axis, but Blender
          // is natively Z-up. When Blender exports GLB it applies a Z→Y
          // correction that puts our intended "height" on the Z axis and
          // our intended "depth" on the Y axis. Rotate +90° around X to
          // swap them back: Z→Y (height up) and Y→Z (depth forward).
          model.rotation.x = Math.PI / 2;
          // Force matrix update so Box3 sees the rotated positions
          model.updateMatrixWorld(true);

          const box = new THREE.Box3().setFromObject(model);

          if (box.isEmpty()) {
            setLoadError('GLB loaded but scene has no geometry.\nCheck Blender server logs.');
            return;
          }

          const ctr  = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          // Centre the model at origin, sit on the floor (Y=0)
          model.position.set(-ctr.x, -box.min.y, -ctr.z);
          // Disable frustum culling — prevents meshes vanishing when the
          // orthographic frustum narrows on pinch/scroll zoom
          model.traverse((obj: any) => { obj.frustumCulled = false; });
          scene.add(model);

          // Fit orthographic frustum to corrected scene extents
          const maxDim = Math.max(size.x, size.y, size.z);
          const half   = maxDim * 0.62;
          const midY   = size.y / 2;
          (camera as any).left   = -half * aspect;
          (camera as any).right  =  half * aspect;
          (camera as any).top    =  half;
          (camera as any).bottom = -half;
          (camera as any).near   = -100000;
          (camera as any).far    =  100000;
          // Isometric position matching Blender's camera: (1, 1, 0.82) direction
          camera.position.set(1, 1, 0.82).normalize().multiplyScalar(maxDim * 2.4);
          camera.lookAt(0, midY, 0);
          controls.target.set(0, midY, 0);
          (camera as any).updateProjectionMatrix();
          controls.update();
        },
        undefined,
        (err: any) => {
          URL.revokeObjectURL(blobUrl);
          setLoadError(`GLTFLoader error: ${err?.message ?? err}`);
        }
      );

      // Resize observer
      const ro = new ResizeObserver(() => {
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        renderer.setSize(nw, nh);
        const na = nw / nh;
        const box3 = new THREE.Box3().setFromObject(scene);
        const sz   = box3.getSize(new THREE.Vector3());
        const half = Math.max(sz.x, sz.y, sz.z) * 0.65 || frustum / 2;
        (camera as any).left   = -half * na;
        (camera as any).right  =  half * na;
        (camera as any).top    =  half;
        (camera as any).bottom = -half;
        (camera as any).updateProjectionMatrix();
      });
      ro.observe(container);

      // Render loop
      let rafId = 0;
      const loop = () => {
        rafId = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
      };
      loop();

      cleanupRef.current = () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        ro.disconnect();
        renderer.dispose();
        container.innerHTML = '';
      };
      } catch (e: any) {
        setLoadError(`Viewer error: ${e?.message ?? e}`);
      }
    })();

    return () => { cleanupRef.current?.(); };
  }, [glbBlob]);

  if (loadError) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-2 bg-red-50 text-red-600"
           style={{ minHeight: 480 }}>
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <pre className="text-xs text-center whitespace-pre-wrap max-w-xs">{loadError}</pre>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gray-50" style={{ minHeight: 480 }}>
      {/* Canvas mount point */}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: 480 }} />
      {/* Loading overlay — hidden once canvas is mounted */}
      {loadStatus && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            {loadStatus}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main BlenderRender Component ────────────────────────────────────────────

export function BlenderRender({ conceptJson, productId }: BlenderRenderProps) {
  const [glbBlob,  setGlbBlob]  = useState<Blob | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [engine,   setEngine]   = useState<Engine>('CYCLES');
  const [samples,  setSamples]  = useState(64);

  async function handleLoad3D() {
    setLoading(true);
    setGlbBlob(null);

    try {
      const params = new URLSearchParams({
        format:  'glb',
        engine,
        samples: String(samples),
        solver:  'FAST',
      });
      if (productId) params.set('product_id', productId);

      const res = await fetch(`/api/render/foam?${params}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(conceptJson),
      });

      if (!res.ok) {
        let msg = `Server error ${res.status}`;
        try { const j = await res.json(); msg = j.error ?? msg; } catch { /**/ }
        toast.error(msg);
        return;
      }

      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('gltf') && !ct.includes('octet-stream')) {
        // Server returned wrong type — likely old server or an error body
        const text = await res.text();
        toast.error(`Server returned ${ct || 'unknown type'} — HF Space may need updating. Preview: ${text.slice(0, 120)}`);
        return;
      }
      const blob = await res.blob();
      setGlbBlob(blob);
    } catch (e: unknown) {
      toast.error(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadGlb() {
    if (!glbBlob) return;
    const pid = (conceptJson as any)?.meta?.product_id ?? 'foam';
    const a   = document.createElement('a');
    a.href     = URL.createObjectURL(glbBlob);
    a.download = `${pid}_blender.glb`;
    a.click();
  }

  const estimatedTime = engine === 'CYCLES'
    ? `~${Math.round(samples * 2)}s CPU`
    : '~15s';

  return (
    <div className="space-y-3">
      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Engine toggle */}
        <div className="flex rounded-lg border overflow-hidden text-xs">
          {(['EEVEE', 'CYCLES'] as Engine[]).map(e => (
            <button
              key={e}
              onClick={() => setEngine(e)}
              disabled={loading}
              className={`px-3 py-1.5 font-medium transition-colors ${
                engine === e
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Samples (Cycles only) */}
        {engine === 'CYCLES' && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Samples</span>
            <select
              value={samples}
              onChange={e => setSamples(Number(e.target.value))}
              disabled={loading}
              className="border rounded px-1.5 py-0.5 text-xs bg-white"
            >
              {[32, 64, 128, 256].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        <span className="text-xs text-gray-400">{estimatedTime}</span>

        <Button
          size="sm"
          variant="outline"
          onClick={handleLoad3D}
          disabled={loading}
          className="text-xs gap-1.5"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Building Blender scene…
            </>
          ) : (
            <>✦ Load Blender 3D</>
          )}
        </Button>

        {glbBlob && (
          <Button size="sm" variant="ghost" onClick={handleDownloadGlb}
                  className="text-xs text-gray-500">
            Download GLB
          </Button>
        )}
      </div>

      {/* ── Side-by-side 3D comparison ────────────────────────── */}
      {glbBlob && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            Three.js geometry  ↔  Blender geometry — drag to rotate both
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* LEFT: Three.js FoamVisualizer */}
            <div className="rounded-xl border overflow-hidden">
              <div className="px-3 py-1.5 border-b bg-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                <span className="text-xs font-medium text-gray-700">Three.js</span>
                <span className="text-xs text-gray-400 ml-auto">client-side geometry</span>
              </div>
              <div className="overflow-hidden" style={{ height: 480 }}>
                <FoamVisualizer conceptJson={conceptJson} compact />
              </div>
            </div>

            {/* RIGHT: Blender GLB in Three.js viewer */}
            <div className="rounded-xl border overflow-hidden">
              <div className="px-3 py-1.5 border-b bg-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                <span className="text-xs font-medium text-gray-700">Blender</span>
                <span className="text-xs text-gray-400 ml-auto">{engine} · server-side geometry</span>
              </div>
              <div style={{ height: 480 }}>
                <BlenderGlbViewer glbBlob={glbBlob} />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Drag to orbit · Scroll to zoom · Right-drag to pan
          </p>
        </div>
      )}
    </div>
  );
}

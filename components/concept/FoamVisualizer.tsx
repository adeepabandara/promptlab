'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/* ═══════════════════════════════════════════════════════════════════
   NEFAB FOAM RENDERER — React / TSX  (inline Three.js, no iframe)
   Three.js r160 loaded via dynamic ESM import (esm.sh CDN).
═══════════════════════════════════════════════════════════════════ */

// ── Three.js + CSG module cache ───────────────────────────────────
let _THREE: any = null;
// Cavity dark factors — updated by buildScene from JSON before each render
let _cavWallF  = 0.50;
let _cavFloorF = 0.32;
async function getThree() {
  if (_THREE) return _THREE;
  // @ts-ignore
  const [threeMod, ocMod, gltfMod, csgMod] = await Promise.all([
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three@0.160.0'),
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls'),
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader'),
    // @ts-ignore
    import(/* webpackIgnore: true */ 'https://esm.sh/three-bvh-csg@0.0.16'),
  ]);
  const OrbitControls = ocMod.OrbitControls  ?? ocMod.default?.OrbitControls;
  const GLTFLoader    = gltfMod.GLTFLoader   ?? gltfMod.default?.GLTFLoader;
  const { Evaluator, Brush, SUBTRACTION } = csgMod;
  const csgEvaluator = new Evaluator();
  csgEvaluator.attributes = ['position', 'normal'];
  _THREE = { ...threeMod, OrbitControls, GLTFLoader, Brush, SUBTRACTION, csgEvaluator };
  return _THREE;
}

// ── Helpers ───────────────────────────────────────────────────────
function col(THREE: any, h: string) {
  return new THREE.Color(h && h.startsWith('#') ? h : '#' + (h || '888888'));
}
function dark(THREE: any, h: string, f = 0.58) {
  return col(THREE, h).clone().multiplyScalar(f);
}
function dv(o: any, ...ks: string[]): number {
  for (const k of ks) if (o?.[k] != null) return +o[k];
  return 0;
}
function normaliseBbox(raw: any) {
  if (!raw) return { x: 300, y: 300, z: 200 };
  if (raw.x != null && raw.z != null) return raw;
  return { x: raw.length ?? raw.width ?? 300, y: raw.width ?? raw.length ?? 300, z: raw.height ?? 200 };
}
function normalisePiece(piece: any) {
  if (piece.plank_dimensions_mm) return piece;
  const bb = piece.bounding_box_mm ?? {}, th = piece.foam_thickness_mm ?? 50;
  return {
    ...piece,
    plank_dimensions_mm: {
      length: dv(bb,'length') || dv(bb,'width') || 400,
      width:  dv(bb,'width')  || dv(bb,'length') || 400,
      height: th,
    },
    position_from_centre_mm: piece.position_from_centre_mm ?? { x: 0, y: 0 },
  };
}

// Auto-inject a shallow product seating pocket for slotted-slab pieces that
// lack one. Gives the visual "product sits in foam" appearance for slots-only
// foam planks. Only injected when the piece has longitudinal slots but no
// existing pocket or seating feature.
function autoInjectSeatPocket(piece: any, bbox: {x:number,y:number,z:number}) {
  const cuts = piece.cut_features ?? [];
  const hasSeat     = cuts.some((c: any) => (c.cut_id ?? '').toLowerCase().includes('seat'));
  const hasAnyPocket= cuts.some(isPocket);
  const hasSlots    = cuts.some((c: any) => (c.type ?? '').toLowerCase() === 'longitudinal_slot');
  if (!hasAnyPocket && hasSlots && !hasSeat) {
    const dim  = piece.plank_dimensions_mm ?? {};
    const pL   = dv(dim, 'length') || 400, pW = dv(dim, 'width') || 400;
    const seatL = Math.min(bbox.x + 4, pL - 10);
    const seatW = Math.min(bbox.y + 4, pW - 10);
    return {
      ...piece,
      cut_features: [
        {
          cut_id: 'product_seating_pocket',
          type: 'relief',
          shape: 'rectangular',
          face: 'top — product-contact face',
          dimensions_mm: { length: seatL, width: seatW, depth: 8 },
          offset_from_centre_mm: { x: 0, y: 0 },
        },
        ...cuts,
      ],
    };
  }
  return piece;
}

// ── Feature classifiers ───────────────────────────────────────────
// isChamfer: plan_chamfer:true, corner_chamfers cut_id, or outer_edge face
function isChamfer(c: any)       { const id=(c.cut_id??'').toLowerCase(),f=(c.face??'').toLowerCase(); return c.plan_chamfer===true||id==='corner_chamfers'||f==='outer_edges'||f.includes('outer_edge'); }
// isFingerRecess: finger in cut_id, or side_wall/sidewall face
function isFingerRecess(c: any)  { const id=(c.cut_id??'').toLowerCase(),f=(c.face??'').toLowerCase(); return id==='finger_recesses'||id.includes('finger')||f==='outer_side_walls'||f.includes('side_wall')||f.includes('sidewall')||f.includes('side wall'); }
function isLocatingRebate(c: any){ const id=(c.cut_id??'').toLowerCase(),f=(c.face??'').toLowerCase(); return id==='locating_rebate'||f==='bottom outer perimeter'||f.includes('perimeter')||f.includes('rebate'); }
// isPocket: routes cuts to the CSG bore/pocket path.
// KEY RULE: circular/elliptical relief cuts are ALWAYS pockets — direction is irrelevant
// for circular geometry. Many LLM-generated JSONs put direction:x_axis on every cut
// including central_relief bores; that must not cause misclassification.
function isPocket(c: any) {
  const t =(c.type ??'').toLowerCase();
  const sh=(c.shape??'').toLowerCase();
  if(t==='clearance_pocket') return true;
  if(t==='relief'){
    if(isChamfer(c)||isFingerRecess(c)||isLocatingRebate(c)) return false;
    // Circular/elliptical = bore or concentric relief — ALWAYS pocket, direction irrelevant
    if(sh==='circular'||sh==='elliptical') return true;
    // Rectangular relief with NO direction = generic pocket (corner_recess, feet, etc.)
    if(sh==='rectangular'&&c.direction==null) return true;
  }
  return false;
}
// isReliefSlot: rectangular relief WITH direction = rib-grid slot channel.
// Circular/elliptical shapes are explicitly excluded — they're bores, never slots.
function isReliefSlot(c: any) {
  const t =(c.type ??'').toLowerCase();
  const sh=(c.shape??'').toLowerCase();
  if(t!=='relief') return false;
  if(isChamfer(c)||isFingerRecess(c)||isLocatingRebate(c)) return false;
  if(sh==='circular'||sh==='elliptical') return false; // circular = pocket, never slot
  return c.direction!=null; // rectangular + direction = slot
}

// ── Orientation ───────────────────────────────────────────────────
const AXIS_MAP: Record<string,[number,number,number]> = {
  '+X':[1,0,0],'-X':[-1,0,0],'+Y':[0,1,0],'-Y':[0,-1,0],'+Z':[0,0,1],'-Z':[0,0,-1],
};
function makeOrientationQ(THREE: any, glbHeightAxis: string, manualYSteps: number) {
  const ax = AXIS_MAP[glbHeightAxis] ?? AXIS_MAP['+Z'];
  const upVec = new THREE.Vector3(...ax), targetY = new THREE.Vector3(0,1,0);
  const Q = new THREE.Quaternion().setFromUnitVectors(upVec, targetY);
  if (manualYSteps % 4 !== 0) {
    const Qs = new THREE.Quaternion().setFromAxisAngle(targetY, manualYSteps * Math.PI / 2);
    Q.premultiply(Qs);
  }
  return Q;
}

// ── Material / geometry builders ─────────────────────────────────
// MeshPhongMaterial: specular highlight distinguishes foam faces from the flat background.
// MeshLambertMaterial on #EDE8E0 against #FFFFFF = near-zero contrast on flat surfaces.
// Phong adds a specular component that makes the foam visibly pop as a 3D object.
function foamMat(THREE: any, foamColor: string) {
  const c2 = col(THREE, foamColor).clone();
  const lum = 0.299 * c2.r + 0.587 * c2.g + 0.114 * c2.b;
  if (lum > 0.94) c2.multiplyScalar(0.94 / lum);
  return new THREE.MeshPhongMaterial({
    color: c2,
    specular: new THREE.Color(0.12, 0.11, 0.10),
    shininess: 18,
  });
}
function cavityWallMat(THREE: any, foamColor: string, wallF = _cavWallF) {
  return new THREE.MeshPhongMaterial({
    color: dark(THREE, foamColor, wallF),
    specular: new THREE.Color(0.04, 0.04, 0.04),
    shininess: 6,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -1,
  });
}
function cavityFloorMat(THREE: any, foamColor: string, floorF = _cavFloorF) {
  return new THREE.MeshPhongMaterial({
    color: dark(THREE, foamColor, floorF),
    specular: new THREE.Color(0.02, 0.02, 0.02),
    shininess: 4,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -1,
  });
}
function edgeMat(THREE: any, foamColor: string) {
  return new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.32) });
}
function rebateMat(THREE: any, foamColor: string) {
  return new THREE.MeshLambertMaterial({ color: dark(THREE, foamColor, 0.78), side: THREE.DoubleSide });
}

// makeOctagonalPrism (v25.1): builds an octagonal prism as a direct BufferGeometry.
// Vertices are placed in the XZ plane (Y = vertical axis) so no rotation is needed.
// Avoids the ExtrudeGeometry + rotateX normal-inversion bug in v25 and earlier.
// three-bvh-csg accepts any BufferGeometry with position+normal — this works as CSG base.
function makeOctagonalPrism(THREE: any, lenX: number, lenZ: number, height: number, chX: number, chZ: number) {
  const hx = lenX / 2, hz = lenZ / 2;
  const cx = Math.min(chX, hx * 0.45);
  const cz = Math.min(chZ, hz * 0.45);
  const pts: [number, number][] = [
    [-hx + cx, -hz], [ hx - cx, -hz],
    [ hx,      -hz + cz], [ hx,   hz - cz],
    [ hx - cx,  hz], [-hx + cx,  hz],
    [-hx,        hz - cz], [-hx, -hz + cz],
  ];
  const N = pts.length; // 8
  const hh = height / 2;
  const verts: number[] = [];
  for (const [x, z] of pts) verts.push(x, -hh, z); // bottom ring
  for (const [x, z] of pts) verts.push(x,  hh, z); // top ring
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = i, b = (i + 1) % N, c = i + N, d = b + N;
    idx.push(a, b, d,  a, d, c); // side quad → 2 triangles
  }
  for (let i = 1; i < N - 1; i++) idx.push(N, N + i, N + i + 1); // top cap
  for (let i = 1; i < N - 1; i++) idx.push(0, i + 1, i);          // bottom cap (CW)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Creates a cutter mesh with optional position and scale applied.
// updateMatrix() computes the local matrix from position+scale, then
// updateMatrixWorld propagates it — both needed for v22 CSG approach.
function makeCutterMesh(THREE: any, geo: any, pos?: {x:number,y:number,z:number}, scale?: {x:number,y:number,z:number}) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  if (pos) mesh.position.set(pos.x, pos.y, pos.z);
  if (scale) mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  return mesh;
}

// ── csgSubtractAll: baked-transform CSG — each cutter's position/scale is
//    baked into its geometry before evaluation, so Brushes run at identity. ──
function csgSubtractAll(THREE: any, L: number, H: number, W: number, cutters: any[], baseGeo?: any) {
  const { Brush, SUBTRACTION, csgEvaluator } = THREE;
  const fallback = baseGeo ?? new THREE.BoxGeometry(L, H, W);
  if (!Brush || !csgEvaluator) return fallback;
  let geo = fallback;
  let consecutiveFails = 0;
  for (const c of cutters) {
    // Abort remaining cutters after 3 consecutive failures — prevents cascading
    // CSG degeneration from mis-classified features blowing out the whole mesh.
    if (consecutiveFails >= 3) {
      console.warn('CSG: 3 consecutive failures — aborting remaining cutters');
      break;
    }
    const lastGoodGeo = geo.clone(); // save before each attempt
    try {
      c.updateMatrix();
      const cg = c.geometry.clone(); cg.applyMatrix4(c.matrix);
      const bA = new Brush(geo.clone()); bA.matrixWorld.identity(); bA.updateMatrixWorld(false);
      const bB = new Brush(cg);          bB.matrixWorld.identity(); bB.updateMatrixWorld(false);
      const r = csgEvaluator.evaluate(bA, bB, SUBTRACTION);
      if (!r || !r.geometry || r.geometry.attributes.position.count < 12) {
        // CSG produced degenerate geometry — keep last good result
        console.warn('CSG produced degenerate geometry, skipping cutter');
        geo = lastGoodGeo;
        consecutiveFails++;
      } else {
        r.geometry.computeVertexNormals(); geo = r.geometry;
        consecutiveFails = 0; // reset on success
      }
    } catch (e: any) {
      console.warn('CSG fail:', e.message);
      geo = lastGoodGeo; // restore on failure
      consecutiveFails++;
    }
  }
  return geo;
}

// ── addCavityLiner: dark interior surfaces placed inside each CSG hole ──
// These make pockets read as going INTO the foam (depth contrast),
// matching Blender quality. CSG alone leaves a dark void; liners fix that.
// Contact face fill strips (around pocket openings) are handled separately
// in buildFoamPlank where L/W plank dims are in scope.
function addCavityLiner(
  THREE: any, grp: any, shape: string, dim: any,
  offX: number, offZ: number, cfY: number, s2: number,
  depth: number, foamColor: string
) {
  const wm   = cavityWallMat(THREE, foamColor);
  const fm2  = cavityFloorMat(THREE, foamColor);
  const flY  = cfY - s2 * depth;
  const midY = cfY - s2 * depth * 0.5;

  if (shape === 'circular') {
    const r = dv(dim, 'diameter', 'width', 'length') / 2 || 50;
    const cwm = wm.clone(); cwm.side = THREE.BackSide; // inner wall only — avoids bleed-through
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(r - 0.5, r - 0.5, depth, 64, 1, true), cwm);
    wall.position.set(offX, midY, offZ);
    grp.add(wall);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r - 0.5, 64), fm2);
    floor.rotation.x = s2 > 0 ? Math.PI / 2 : -Math.PI / 2;
    floor.position.set(offX, flY, offZ);
    grp.add(floor);
    // Torus rim — PhongMaterial for slight specular edge pop
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r, Math.max(2.5, r * 0.04), 8, 64),
      new THREE.MeshPhongMaterial({ color: dark(THREE, foamColor, 0.40), side: THREE.DoubleSide }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(offX, cfY, offZ);
    grp.add(rim);
    // Edge circle LINE — always visible regardless of camera angle
    const rimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 65 }, (_: any, i: number) => {
          const a = i / 64 * Math.PI * 2;
          return new THREE.Vector3(offX + Math.cos(a) * r, cfY, offZ + Math.sin(a) * r);
        })),
      new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.25) }));
    grp.add(rimLine);
  } else if (shape === 'elliptical') {
    const rX = dv(dim, 'length') / 2 || 60, rZ = dv(dim, 'width') / 2 || 40;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(rX - 0.5, rX - 0.5, depth, 64, 1, true), wm);
    wall.scale.z = rZ / rX;
    wall.position.set(offX, midY, offZ);
    grp.add(wall);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(rX - 0.5, 64), fm2);
    floor.scale.z = rZ / rX;
    floor.rotation.x = s2 > 0 ? Math.PI / 2 : -Math.PI / 2;
    floor.position.set(offX, flY, offZ);
    grp.add(floor);
  } else {
    const pL = dv(dim, 'length', 'width') || 60;
    const pW = dv(dim, 'width', 'length') || 60;
    // Four wall panels
    ([
      [pL, depth,  0,    pW/2,  0,  0,            s2>0?0:Math.PI],
      [pL, depth,  0,   -pW/2,  0,  0,            s2>0?Math.PI:0],
      [pW, depth,  pL/2,  0,    0,  Math.PI/2,    0],
      [pW, depth, -pL/2,  0,    0, -Math.PI/2,    0],
    ] as [number,number,number,number,number,number,number][]).forEach(([bw,bh,px,pz,rx,ry,rz]) => {
      const wp = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), wm.clone());
      wp.rotation.set(rx, ry, rz);
      wp.position.set(offX + px, midY, offZ + pz);
      wp.renderOrder = 3; // above face fill (1) and floor (2), below rim (5)
      grp.add(wp);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(pL - 1, pW - 1), fm2);
    floor.rotation.x = s2 > 0 ? Math.PI / 2 : -Math.PI / 2;
    floor.position.set(offX, flY, offZ);
    floor.renderOrder = 2;
    grp.add(floor);

    // Pocket rim step-down: thin horizontal strips at the top edge of each pocket wall.
    // Visual cue for the foam "ledge" at pocket entry — shows material thickness.
    const rimMat = new THREE.MeshPhongMaterial({
      color: dark(THREE, foamColor, 0.62),
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const rimH = Math.min(depth * 0.15, 8);
    const rimY = cfY - s2 * rimH / 2;
    ([
      [pL, rimH,  0,    pW/2,  0,  0,            s2>0?0:Math.PI],
      [pL, rimH,  0,   -pW/2,  0,  0,            s2>0?Math.PI:0],
      [pW, rimH,  pL/2,  0,    0,  Math.PI/2,    0],
      [pW, rimH, -pL/2,  0,    0, -Math.PI/2,    0],
    ] as [number,number,number,number,number,number,number][]).forEach(([bw,bh,px,pz,rx,ry,rz]) => {
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), rimMat.clone());
      rim.rotation.set(rx, ry, rz);
      rim.position.set(offX + px, rimY, offZ + pz);
      rim.renderOrder = 5;
      grp.add(rim);
    });
  }
}

// ── buildFoamPlank: v23 — CSG with baked transforms + cavity liners ──
// Pass 1: bake each cutter's position/scale into its geometry, then
//         run CSG subtraction in a common local space (no matrixWorld issues).
// Pass 2: add interior liner meshes so cavities have visible dark surfaces.
function buildFoamPlank(THREE: any, L: number, W: number, H: number, foamColor: string, contactFaceUp: boolean, cuts: any[]) {
  // v25.43: normalise LLM cut-type aliases → canonical types before any classification.
  // Some models emit 'locating_pocket' or 'seating_pocket' instead of 'clearance_pocket'.
  cuts = cuts.map((c: any) => {
    const t = (c.type ?? '').toLowerCase();
    if (t === 'locating_pocket' || t === 'seating_pocket') return { ...c, type: 'clearance_pocket' };
    return c;
  });

  const grp = new THREE.Group();
  const fm  = foamMat(THREE, foamColor);
  // Fixed dark edge lines — independent of foam colour for maximum visibility.
  // Foam-derived dark() on cream = barely visible grey; fixed dark brown reads on any colour.
  const em  = new THREE.LineBasicMaterial({ color: new THREE.Color(0.22, 0.18, 0.14) });

  // ── Plan-view corner chamfers (octagonal base profile) ───────────
  // If a corner_chamfers cut has plan_chamfer:true, the base foam body
  // uses an extruded octagonal shape instead of a box.
  // FIX: use isChamfer() — matches any chamfer cut, not just corner_chamfers cut_id.
  const _cc = cuts.find(isChamfer);
  const _pc = _cc?.plan_chamfer === true;
  // v25.47: do NOT cap chamfer by plank height. Pieces in the same assembly must share
  // identical chamfer sizes so cap and cavity pieces have the same octagon plan profile
  // (only height differs). solidGeo already clamps each to 44% of plan half-width,
  // preventing any side-bleed regardless of JSON values.
  const _cs = _pc ? Math.min(dv(_cc?.dimensions_mm ?? {}, 'length', 'width') || 40, L * 0.15, W * 0.15) : 0;
  // makeFoamBodyGeo (v25.1): octagonal BufferGeometry when plan_chamfer is true.
  // Direct XZ-plane vertex construction — no ExtrudeGeometry+rotateX normal-inversion.
  // three-bvh-csg handles this correctly as a CSG base geometry.
  // Body already octagonal → no diagonal corner CSG cutters needed.
  function makeFoamBodyGeo() {
    if (_pc && _cs > 5) return makeOctagonalPrism(THREE, L, W, H, _cs, _cs);
    return new THREE.BoxGeometry(L, H, W);
  }
  // makeOctagonalOutline: edge lines reuse the same octagonal body geometry.
  function makeOctagonalOutline() {
    return makeFoamBodyGeo();
  }

  const pocketCuts  = cuts.filter(isPocket);
  // reliefSlots = relief type WITH direction field (rib-grid channels) — slot path, not pocket path.
  const reliefSlots = cuts.filter(isReliefSlot);
  const slotCuts    = cuts.filter((c: any) => (c.type??'').toLowerCase() === 'longitudinal_slot');
  // allSlotCuts combines explicit longitudinal_slot + relief-type directional channels
  const allSlotCuts = [...slotCuts, ...reliefSlots];
  const throughCuts = cuts.filter((c: any) => (c.type??'').toLowerCase() === 'through_slot');
  const fingerCut   = cuts.find(isFingerRecess);
  const rebateCut   = cuts.find(isLocatingRebate);

  // ── Build cutter list ─────────────────────────────────────────────
  // ORDER: functional cuts first (pocket → slot → through → finger),
  // cosmetic chamfers LAST. If the consecutiveFails guard fires, bore/slot
  // cuts are never sacrificed — only chamfers at the end are skipped.
  const cutters: any[] = [];

  // ── Pocket cutters FIRST ──
  pocketCuts.forEach((cut: any) => {
    // Staircase multi-layer pocket (v25.9): uses per-step dimensions instead of normal pocket
    if ((cut.type ?? '').toLowerCase() === 'clearance_pocket' && cut.multi_layer_pocket === true && Array.isArray(cut.staircase_steps)) {
      const thisStep = cut.staircase_steps.find((s: any) => s.cut_id === cut.cut_id);
      if (thisStep) {
        const sdim = cut.dimensions_mm ?? {};
        const sOffX = cut.offset_from_centre_mm?.x ?? 0;
        const sOffZ = cut.offset_from_centre_mm?.y ?? 0;
        const sFs   = (cut.face ?? '').toLowerCase();
        const sDepth = Math.min(thisStep.pocket_depth || 20, H * 0.95);
        const sLenX  = thisStep.pocket_length || dv(sdim, 'length', 'width') || 100;
        const sLenZ  = thisStep.pocket_width  || dv(sdim, 'width', 'length') || 100;
        const ySignS = sFs.includes('bottom') ? -1 : 1;
        const sYPos  = ySignS * (H / 2 - sDepth / 2);
        cutters.push(makeCutterMesh(THREE,
          new THREE.BoxGeometry(sLenX + 1, sDepth + 1, sLenZ + 1),
          {x: sOffX, y: sYPos, z: sOffZ}));
      }
      return; // skip normal pocket processing for this cut
    }
    const shape = (cut.shape ?? '').toLowerCase();
    const dim   = cut.dimensions_mm ?? {};
    const offX  = cut.offset_from_centre_mm?.x ?? 0;
    const offZ  = cut.offset_from_centre_mm?.y ?? 0;
    const fs    = (cut.face ?? '').toLowerCase();
    let cd = contactFaceUp;
    if (fs.includes('top') && !fs.includes('bottom')) cd = true;
    if (fs.includes('bottom') && !fs.includes('top')) cd = false;
    if (fs.includes('inner')) cd = false;
    const s2    = cd ? 1 : -1;
    const cfY   = s2 * H / 2;
    const depth = Math.min(dv(dim, 'depth') || 20, H * 0.95);
    const cutCY = cfY - s2 * (depth / 2);
    if (shape === 'circular') {
      const r = dv(dim, 'diameter', 'width', 'length') / 2 || 50;
      cutters.push(makeCutterMesh(THREE,
        new THREE.CylinderGeometry(r + 0.5, r + 0.5, depth + 1, 64),
        {x: offX, y: cutCY, z: offZ}));
    } else if (shape === 'elliptical') {
      const rX = dv(dim, 'length') / 2 || 60, rZ = dv(dim, 'width') / 2 || 40;
      cutters.push(makeCutterMesh(THREE,
        new THREE.CylinderGeometry(rX + 0.5, rX + 0.5, depth + 1, 64),
        {x: offX, y: cutCY, z: offZ}, {x: 1, y: 1, z: rZ / rX}));
    } else if (shape === 'l_shaped' || shape === 't_shaped' || shape === 'stepped') {
      // v25.51: L/T/stepped = two-rectangle union. Primary rect + secondary rect from dim.secondary.
      const pL1 = dv(dim, 'length', 'width') || 60;
      const pW1 = dv(dim, 'width', 'length') || 60;
      cutters.push(makeCutterMesh(THREE,
        new THREE.BoxGeometry(pL1 + 1, depth + 1, pW1 + 1),
        {x: offX, y: cutCY, z: offZ}));
      const _sec = dim.secondary ?? {};
      const pL2 = dv(_sec, 'length', 'width') || 0;
      const pW2 = dv(_sec, 'width', 'length') || 0;
      if (pL2 > 0 && pW2 > 0) {
        const dep2 = Math.min(dv(_sec, 'depth') || dv(dim, 'depth') || 20, H * 0.95);
        const ox2 = offX + (_sec.offset_x ?? 0);
        const oz2 = offZ + (_sec.offset_z ?? 0);
        const cutCY2 = cfY - s2 * (dep2 / 2);
        cutters.push(makeCutterMesh(THREE,
          new THREE.BoxGeometry(pL2 + 1, dep2 + 1, pW2 + 1),
          {x: ox2, y: cutCY2, z: oz2}));
      }
    } else {
      const pL = dv(dim, 'length', 'width') || 60;
      const pW = dv(dim, 'width', 'length') || 60;
      cutters.push(makeCutterMesh(THREE,
        new THREE.BoxGeometry(pL + 1, depth + 1, pW + 1),
        {x: offX, y: cutCY, z: offZ}));
    }
  });

  // ── Slot cutters (longitudinal_slot + relief directional channels) ──
  allSlotCuts.forEach((cut: any) => {
    const dim  = cut.dimensions_mm ?? {};
    const sLen = dv(dim, 'length') || 400, sWid = dv(dim, 'width') || 45;
    const sDep = Math.min(dv(dim, 'depth') || H * 0.5, H * 0.6);
    const offX = cut.offset_from_centre_mm?.x ?? 0;
    const offZ = cut.offset_from_centre_mm?.y ?? 0;
    const dirn = (cut.direction ?? 'x_axis').toLowerCase();
    const fs   = (cut.face ?? '').toLowerCase();
    let cd = contactFaceUp;
    if (fs.includes('top') && !fs.includes('bottom')) cd = true;
    if (fs.includes('bottom') && !fs.includes('top')) cd = false;
    if (fs.includes('inner')) cd = false;
    const s2 = cd ? 1 : -1, cfY = s2 * H / 2, cutCY = cfY - s2 * (sDep / 2);
    const bx = dirn === 'x_axis' ? sLen + 1 : sWid + 1;
    const bz = dirn === 'x_axis' ? sWid + 1 : sLen + 1;
    cutters.push(makeCutterMesh(THREE,
      new THREE.BoxGeometry(bx, sDep + 1, bz),
      {x: offX, y: cutCY, z: offZ}));
  });

  // ── Through-slot cutters + inline near-black liners ──
  throughCuts.forEach((cut: any) => {
    const dim     = cut.dimensions_mm ?? {};
    const dirn    = (cut.direction ?? 'x_axis').toLowerCase();
    const gapDim  = dv(dim, 'length', 'width') || 60;
    const thruDim = dv(dim, 'width', 'length') || 30;
    const offX    = cut.offset_from_centre_mm?.x ?? 0;
    const offZ    = cut.offset_from_centre_mm?.y ?? 0;
    const bx = dirn === 'x_axis' ? gapDim + 1 : thruDim + 1;
    const bz = dirn === 'x_axis' ? thruDim + 1 : gapDim + 1;
    cutters.push(makeCutterMesh(THREE,
      new THREE.BoxGeometry(bx, H + 2, bz),
      {x: offX, y: 0, z: offZ}));
    // No gap wall liners — through-slots are fully open air, not lined cavities
  });

  // Finger-recess cutters suppressed (v25.42): at this camera scale the CSG holes
  // and their liner panels render as floating dark rectangular patches on the foam
  // side faces. Finger recesses are a manufacturing detail — not needed for
  // concept-level visual comprehension. Skipped entirely.

  // Note: diagonal corner cutters removed (v25.1). makeFoamBodyGeo() now returns
  // an octagonal BufferGeometry when plan_chamfer is true — body is already octagonal,
  // so CSG corner cutters are no longer needed and cannot silently fail.

  // ── Pass 1: CSG — baked-transform, octagonal base if plan_chamfer ──
  const finalGeo = csgSubtractAll(THREE, L, H, W, cutters, makeFoamBodyGeo());
  const resultMesh = new THREE.Mesh(finalGeo, fm);
  resultMesh.geometry.computeVertexNormals();
  resultMesh.castShadow    = true;
  resultMesh.receiveShadow = true;
  grp.add(resultMesh);

  // ── Pass 2: cavity liners — visible interior surfaces for depth ──
  pocketCuts.forEach((cut: any) => {
    // Staircase pocket: draw step wall planes instead of normal liner
    if ((cut.type ?? '').toLowerCase() === 'clearance_pocket' && cut.multi_layer_pocket === true && Array.isArray(cut.staircase_steps)) {
      const thisStep = cut.staircase_steps.find((s: any) => s.cut_id === cut.cut_id);
      if (thisStep) {
        const sdim = cut.dimensions_mm ?? {};
        const sOffX = cut.offset_from_centre_mm?.x ?? 0;
        const sOffZ = cut.offset_from_centre_mm?.y ?? 0;
        const sFs   = (cut.face ?? '').toLowerCase();
        const sDepth = Math.min(thisStep.pocket_depth || 20, H * 0.95);
        const sLenX  = thisStep.pocket_length || dv(sdim, 'length', 'width') || 100;
        const sLenZ  = thisStep.pocket_width  || dv(sdim, 'width', 'length') || 100;
        const ySignS = sFs.includes('bottom') ? -1 : 1;
        const sCfY   = ySignS * H / 2;
        addCavityLiner(THREE, grp, 'rectangular',
          { length: sLenX, width: sLenZ, depth: sDepth },
          sOffX, sOffZ, sCfY, ySignS, sDepth, foamColor);
      }
      return;
    }
    const shape = (cut.shape ?? '').toLowerCase();
    const dim   = cut.dimensions_mm ?? {};
    const offX  = cut.offset_from_centre_mm?.x ?? 0;
    const offZ  = cut.offset_from_centre_mm?.y ?? 0;
    const fs    = (cut.face ?? '').toLowerCase();
    let cd = contactFaceUp;
    if (fs.includes('top') && !fs.includes('bottom')) cd = true;
    if (fs.includes('bottom') && !fs.includes('top')) cd = false;
    if (fs.includes('inner')) cd = false;
    const s2    = cd ? 1 : -1;
    const cfY   = s2 * H / 2;
    const depth = Math.min(dv(dim, 'depth') || 20, H * 0.95);
    if (shape === 'l_shaped' || shape === 't_shaped' || shape === 'stepped') {
      // v25.51: two-rectangle liner for L/T/stepped shapes
      const pL1 = dv(dim, 'length', 'width') || 60;
      const pW1 = dv(dim, 'width', 'length') || 60;
      addCavityLiner(THREE, grp, 'rectangular', { length: pL1, width: pW1 }, offX, offZ, cfY, s2, depth, foamColor);
      const _sec = dim.secondary ?? {};
      const pL2 = dv(_sec, 'length', 'width') || 0;
      const pW2 = dv(_sec, 'width', 'length') || 0;
      if (pL2 > 0 && pW2 > 0) {
        const dep2 = Math.min(dv(_sec, 'depth') || depth, H * 0.95);
        const ox2 = offX + (_sec.offset_x ?? 0);
        const oz2 = offZ + (_sec.offset_z ?? 0);
        addCavityLiner(THREE, grp, 'rectangular', { length: pL2, width: pW2 }, ox2, oz2, cfY, s2, dep2, foamColor);
      }
    } else {
      addCavityLiner(THREE, grp, shape, dim, offX, offZ, cfY, s2, depth, foamColor);
    }
  });

  // Slot liners (includes relief directional channels)
  allSlotCuts.forEach((cut: any) => {
    const dim  = cut.dimensions_mm ?? {};
    const sLen = dv(dim, 'length') || 400, sWid = dv(dim, 'width') || 45;
    const sDep = Math.min(dv(dim, 'depth') || H * 0.5, H * 0.6);
    const offX = cut.offset_from_centre_mm?.x ?? 0;
    const offZ = cut.offset_from_centre_mm?.y ?? 0;
    const dirn = (cut.direction ?? 'x_axis').toLowerCase();
    const fs   = (cut.face ?? '').toLowerCase();
    let cd = contactFaceUp;
    if (fs.includes('top') && !fs.includes('bottom')) cd = true;
    if (fs.includes('bottom') && !fs.includes('top')) cd = false;
    if (fs.includes('inner')) cd = false;
    const s2 = cd ? 1 : -1, cfY = s2 * H / 2;
    const flY  = cfY - s2 * sDep;
    const midY = cfY - s2 * sDep * 0.5;
    const wm   = cavityWallMat(THREE, foamColor);
    const fm2  = cavityFloorMat(THREE, foamColor);
    // Floor
    const flGeo = dirn === 'x_axis'
      ? new THREE.PlaneGeometry(sLen - 1, sWid - 1)
      : new THREE.PlaneGeometry(sWid - 1, sLen - 1);
    const fl = new THREE.Mesh(flGeo, fm2);
    fl.rotation.x = s2 > 0 ? Math.PI / 2 : -Math.PI / 2;
    fl.position.set(offX, flY, offZ);
    fl.renderOrder = 4;
    grp.add(fl);
    // Two long side walls
    if (dirn === 'x_axis') {
      [-1, 1].forEach((sz: number) => {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(sLen - 1, sDep), wm.clone());
        w.rotation.y = sz > 0 ? 0 : Math.PI;
        w.position.set(offX, midY, offZ + sz * (sWid / 2));
        grp.add(w);
      });
    } else {
      [-1, 1].forEach((sx: number) => {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(sLen - 1, sDep), wm.clone());
        w.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        w.position.set(offX + sx * (sWid / 2), midY, offZ);
        grp.add(w);
      });
    }
  });

  // Finger-recess liners suppressed (v25.42): see cutter comment above.

  // ── Contact face fill — foam-coloured panels on the contact face ──
  // Placed AT faceY with polygonOffset pulling it toward camera — no z-fighting,
  // depthWrite:false lets cavity liners show through hole regions.
  {
    const sy     = contactFaceUp ? 1 : -1;
    const faceY  = sy * H / 2;
    const rotX   = contactFaceUp ? -Math.PI / 2 : Math.PI / 2;
    const fm2    = new THREE.MeshPhongMaterial({
      color: col(THREE, foamColor),
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Through-slot: show arm faces on either side of the gap, not a solid face
    const hasThruSlot = throughCuts.length > 0;

    if (hasThruSlot) {
      throughCuts.forEach((cut: any) => {
        const dim    = cut.dimensions_mm ?? {};
        const dirn   = (cut.direction ?? 'x_axis').toLowerCase();
        const gapDim = dv(dim, 'length', 'width') || 60;
        const offX   = cut.offset_from_centre_mm?.x ?? 0;
        const offZ   = cut.offset_from_centre_mm?.y ?? 0;
        const thruDimFill = dv(dim, 'width', 'length') || (dirn === 'x_axis' ? W : L);
        if (dirn === 'x_axis') {
          const armW = (L - gapDim) / 2;
          if (armW > 5) {
            [-1, 1].forEach((s: number) => {
              const p = new THREE.Mesh(new THREE.PlaneGeometry(armW, thruDimFill),
                new THREE.MeshPhongMaterial({ color: col(THREE, foamColor), side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
              p.rotation.x = rotX;
              p.position.set(offX + s * (gapDim / 2 + armW / 2), faceY, offZ);
              p.renderOrder = 2; grp.add(p);
            });
          }
        } else {
          const armW = (W - gapDim) / 2;
          if (armW > 5) {
            [-1, 1].forEach((s: number) => {
              const p = new THREE.Mesh(new THREE.PlaneGeometry(thruDimFill, armW), fm2);
              p.rotation.x = rotX;
              p.position.set(offX, faceY, offZ + s * (gapDim / 2 + armW / 2));
              p.renderOrder = 1; grp.add(p);
            });
          }
        }
        // No gap floor — through-slot has no floor (truly through)
        // The near-black gap walls provide enough depth contrast
      });

    } else if (pocketCuts.length === 0 && allSlotCuts.length === 0) {
      // No cuts — solid contact face
      const f = new THREE.Mesh(new THREE.PlaneGeometry(L, W), fm2);
      f.rotation.x = rotX; f.position.y = faceY; f.renderOrder = 0;
      grp.add(f);

    } else if (pocketCuts.length === 0 && allSlotCuts.length > 0) {
      // Slots only — placed at faceY, polygonOffset handles z-fighting
      const f = new THREE.Mesh(new THREE.PlaneGeometry(L, W), fm2);
      f.rotation.x = rotX; f.position.y = faceY; f.renderOrder = 0;
      grp.add(f);

    } else {
      // Has pockets — ONE combined ShapeGeometry per face with ALL pocket holes merged.
      // Critical: separate ShapeGeometry per pocket causes overlapping face fills that
      // hide each other's openings (e.g. foot-relief fills cover a seating pocket).
      // Grouping all holes into one shape avoids z-fighting and shows all openings correctly.
      const pocketsByFace = new Map<number, {shape:string;dim:any;offX:number;offZ:number}[]>();
      pocketCuts.forEach((cut: any) => {
        const fs = (cut.face ?? '').toLowerCase();
        let pFaceY = faceY;
        if (fs.includes('top')    && !fs.includes('bottom')) pFaceY =  H / 2;
        if (fs.includes('bottom') && !fs.includes('top'))    pFaceY = -H / 2;
        if (!pocketsByFace.has(pFaceY)) pocketsByFace.set(pFaceY, []);
        pocketsByFace.get(pFaceY)!.push({
          shape: (cut.shape ?? '').toLowerCase(),
          dim:   cut.dimensions_mm ?? {},
          offX:  cut.offset_from_centre_mm?.x ?? 0,
          offZ:  cut.offset_from_centre_mm?.y ?? 0,
        });
      });

      pocketsByFace.forEach((pockets, pFaceY) => {
        // Build one outer shape for this face, then push all pocket holes into it
        const faceShape = new THREE.Shape();
        faceShape.moveTo(-L / 2, -W / 2);
        faceShape.lineTo( L / 2, -W / 2);
        faceShape.lineTo( L / 2,  W / 2);
        faceShape.lineTo(-L / 2,  W / 2);
        faceShape.closePath();

        pockets.forEach(({ shape, dim, offX, offZ }) => {
          if (shape === 'circular') {
            const r = dv(dim, 'diameter', 'width', 'length') / 2 || 50;
            const hole = new THREE.Path();
            // Clockwise winding required for Three.js ShapeGeometry holes
            hole.absarc(offX, offZ, r + 0.5, 0, Math.PI * 2, true);
            faceShape.holes.push(hole);
            // Edge circle line (per pocket, not per face)
            grp.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(
                Array.from({ length: 65 }, (_: any, i: number) => {
                  const a = i / 64 * Math.PI * 2;
                  return new THREE.Vector3(offX + Math.cos(a) * (r + 1), pFaceY, offZ + Math.sin(a) * (r + 1));
                })),
              new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.30) })));
          } else {
            const pL = dv(dim, 'length', 'width') || 60;
            const pW = dv(dim, 'width', 'length') || 60;
            // Rectangular hole — CW winding (right-bottom → left-bottom → left-top → right-top)
            // After rotateX(-PI/2): shape_X→world_X, shape_Y→world_Z
            const rectHole = new THREE.Path();
            rectHole.moveTo(offX + pL / 2, offZ - pW / 2); // right-bottom ← CW start
            rectHole.lineTo(offX - pL / 2, offZ - pW / 2); // left-bottom
            rectHole.lineTo(offX - pL / 2, offZ + pW / 2); // left-top
            rectHole.lineTo(offX + pL / 2, offZ + pW / 2); // right-top
            rectHole.closePath();
            faceShape.holes.push(rectHole);
            // Edge rectangle line at pocket perimeter (per pocket)
            const hpL = pL / 2, hpW = pW / 2;
            grp.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(offX - hpL, pFaceY, offZ - hpW),
                new THREE.Vector3(offX + hpL, pFaceY, offZ - hpW),
                new THREE.Vector3(offX + hpL, pFaceY, offZ + hpW),
                new THREE.Vector3(offX - hpL, pFaceY, offZ + hpW),
                new THREE.Vector3(offX - hpL, pFaceY, offZ - hpW),
              ]),
              new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.30) })));
          }
        });

        // One combined ShapeGeometry for all holes on this face
        const faceGeo = new THREE.ShapeGeometry(faceShape, 64);
        faceGeo.rotateX(-Math.PI / 2); // XY shape → XZ horizontal plane
        const faceMesh = new THREE.Mesh(faceGeo, fm2.clone());
        faceMesh.position.set(0, pFaceY, 0);
        faceMesh.renderOrder = 1;
        grp.add(faceMesh);
      });
    }
  }

  // Edge lines removed (v25.13) — box outline creates distracting square artefacts

  // ── Pocket indicators on opposite face ──────────────────────────────
  // When pockets face the hidden (non-camera) face of a top slab, draw an
  // indicator outline on the VISIBLE face — standard engineering convention
  // for hidden features. Only fires for top pieces (contactFaceUp=false)
  // where pockets are on the bottom face (facing the product, not the viewer).
  {
    const sy = contactFaceUp ? 1 : -1;
    const visibleFaceY = -sy * H / 2; // NON-contact face = visible from camera
    const indicatorMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(0.30, 0.25, 0.18), // dark warm brown — visible on cream
    });

    pocketCuts.forEach((cut: any) => {
      const dim  = cut.dimensions_mm ?? {};
      const offX = cut.offset_from_centre_mm?.x ?? 0;
      const offZ = cut.offset_from_centre_mm?.y ?? 0;
      const fs   = (cut.face ?? '').toLowerCase();
      // Determine which face this pocket is on
      let pocketOnTop = contactFaceUp;
      if (fs.includes('top')    && !fs.includes('bottom')) pocketOnTop = true;
      if (fs.includes('bottom') && !fs.includes('top'))    pocketOnTop = false;
      const pocketFaceY = pocketOnTop ? H / 2 : -H / 2;
      // Only draw indicator for top pieces (pockets face down, hidden from viewer)
      if (contactFaceUp) return; // bottom piece — pocket visible directly
      if (Math.sign(pocketFaceY) !== Math.sign(-H / 2)) return; // pocket not on bottom face

      const shape = (cut.shape ?? '').toLowerCase();
      if (shape === 'circular') {
        const r = dv(dim, 'diameter', 'width', 'length') / 2 || 50;
        const pts = Array.from({ length: 33 }, (_: any, i: number) => {
          const a = i / 32 * Math.PI * 2;
          return new THREE.Vector3(offX + Math.cos(a) * r, visibleFaceY, offZ + Math.sin(a) * r);
        });
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), indicatorMat));
      } else {
        const pL = dv(dim, 'length', 'width') || 60;
        const pW = dv(dim, 'width', 'length') || 60;
        const hpL = pL / 2, hpW = pW / 2;
        // Outer rectangle
        grp.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(offX - hpL, visibleFaceY, offZ - hpW),
            new THREE.Vector3(offX + hpL, visibleFaceY, offZ - hpW),
            new THREE.Vector3(offX + hpL, visibleFaceY, offZ + hpW),
            new THREE.Vector3(offX - hpL, visibleFaceY, offZ + hpW),
            new THREE.Vector3(offX - hpL, visibleFaceY, offZ - hpW),
          ]), indicatorMat));
        // Cross hair — marks it as a hidden pocket, not just a border line
        grp.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(offX - hpL * 0.4, visibleFaceY, offZ),
            new THREE.Vector3(offX + hpL * 0.4, visibleFaceY, offZ),
          ]), indicatorMat));
        grp.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(offX, visibleFaceY, offZ - hpW * 0.4),
            new THREE.Vector3(offX, visibleFaceY, offZ + hpW * 0.4),
          ]), indicatorMat));
        // Diagonal corner mark — engineering hidden-feature depth convention
        grp.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(offX + hpL * 0.7, visibleFaceY, offZ + hpW * 0.7),
            new THREE.Vector3(offX + hpL,       visibleFaceY, offZ + hpW),
          ]), indicatorMat));
      }
    });
  }

  // Locating rebate strips suppressed: the perimeter BoxGeometry panels appeared as
  // square protrusions at the foam corners. Manufacturing detail, not needed for concept view.

  // Corner chamfer decorative strips suppressed: small diagonal BoxGeometry slabs at
  // the 4 top-face corners appeared as protruding pieces at the foam block corners.
  // The octagonal body from makeFoamBodyGeo() already represents the chamfer visually.

  return grp;
}

function buildPlank(THREE: any, piece: any, contactDir: string, foamColor: string) {
  const { length: L, width: W, height: H } = piece.plank_dimensions_mm;
  const cuts   = piece.cut_features ?? [];
  const openUp = contactDir === '+y';
  return buildFoamPlank(THREE, L, W, H, foamColor, openUp, cuts);
}

// totalBottom = max(layerOff + H) over all bottom pieces = total bottom foam stack height.
// For correct step-assembly assembled positions, all layers are referenced from the same
// carton floor, so their assembled centres are: -(totalBottom - layerOff - H/2).
// This prevents the old formula from overlapping step-assembly layers.
function getPlacement(piece: any, rawBbox: any, spacing: number, exploded: boolean, totalBottom?: number, carton?: {x:number,y:number,z:number}) {
  const bbox=normaliseBbox(rawBbox), face=(piece.face??'').toLowerCase(), pH=bbox.z;
  const H=piece.plank_dimensions_mm?.height??50, gap=exploded?spacing:0;
  const ox=piece.position_from_centre_mm?.x??0, oz=piece.position_from_centre_mm?.y??piece.position_from_centre_mm?.z??0;
  const layerOff=piece.layer_offset_from_face_mm??0;
  let pos:[number,number,number]=[ox,0,oz], rot:[number,number,number]=[0,0,0], contactDir='-y';
  if(face==='bottom'){
    if(gap>0&&carton){
      // v25.29 explode: stack from carton floor outward — cap always closest to floor,
      // inboard pieces (cavity) sit above cap by their layerOff. No totalBottom needed.
      const halfCartonZ=carton.z/2;
      pos=[ox, -(halfCartonZ)-gap+layerOff+H/2, oz];
    } else {
      // Assembled: foam sits below product at y=0 — ref from totalBottom unchanged
      const tot=totalBottom||(layerOff+H);
      pos=[ox, -(tot-layerOff-H/2), oz];
    }
    contactDir='+y';
  } else if(face==='top'){
    if(gap>0&&carton){
      // v25.29 explode: stack from carton lid downward — cap closest to lid, cavity below
      const halfCartonZ=carton.z/2;
      pos=[ox, halfCartonZ+gap-layerOff-H/2, oz];
    } else {
      pos=[ox, pH+H/2+layerOff, oz];
    }
    contactDir='-y';
  } else if(face.includes('left')) {
    const halfGapX = carton ? (carton.x - bbox.x) / 2 : H + 60;
    const wallX = -(bbox.x / 2 + halfGapX);
    const worldX = wallX + layerOff + H / 2;
    pos=[worldX - gap, pH / 2, oz]; rot=[0,0,Math.PI/2]; // v25.26: flat gap, no per-piece mult
  } else if(face.includes('right')) {
    const halfGapX = carton ? (carton.x - bbox.x) / 2 : H + 60;
    const wallX = bbox.x / 2 + halfGapX;
    const worldX = wallX - layerOff - H / 2;
    pos=[worldX + gap, pH / 2, oz]; rot=[0,0,-Math.PI/2]; // v25.26: flat gap, no per-piece mult
  } else if(face.includes('front')) {
    const halfGapY = carton ? (carton.y - bbox.y) / 2 : H + 60;
    const wallZ = -(bbox.y / 2 + halfGapY);
    const worldZ = wallZ + layerOff + H / 2;
    pos=[ox, pH / 2, worldZ - gap]; rot=[Math.PI/2,0,0]; // v25.26: flat gap, no per-piece mult
  } else if(face.includes('back')) {
    const halfGapY = carton ? (carton.y - bbox.y) / 2 : H + 60;
    const wallZ = bbox.y / 2 + halfGapY;
    const worldZ = wallZ - layerOff - H / 2;
    pos=[ox, pH / 2, worldZ + gap]; rot=[-Math.PI/2,0,0]; // v25.26: flat gap, no per-piece mult
  }
  const pRot=(piece.rotation_y_deg??0)*Math.PI/180;
  return {pos, rot:[rot[0],rot[1]+pRot,rot[2]] as [number,number,number], contactDir};
}

async function loadGLBProduct(THREE: any, glbUrl: string, glbHeightAxis: string, manualRot: number, cachedModel: any, targetBbox?: {x:number,y:number,z:number}) {
  return new Promise<{model:any}>((resolve, reject) => {
    if (cachedModel) {
      const Q=makeOrientationQ(THREE,glbHeightAxis,manualRot);
      cachedModel.rotation.set(0,0,0); cachedModel.quaternion.copy(Q); cachedModel.updateMatrixWorld(true);
      resolve({model:cachedModel}); return;
    }
    new THREE.GLTFLoader().load(glbUrl, (gltf:any) => {
      const model=gltf.scene, Q=makeOrientationQ(THREE,glbHeightAxis,manualRot);
      model.rotation.set(0,0,0); model.quaternion.copy(Q); model.updateMatrixWorld(true);

      // Auto-scale: if the model's largest dimension differs greatly from the
      // target bbox, assume a unit mismatch (e.g. metres vs mm) and correct it.
      if (targetBbox) {
        const box0=new THREE.Box3().setFromObject(model), sz0=new THREE.Vector3();
        box0.getSize(sz0);
        const mMax=Math.max(sz0.x,sz0.y,sz0.z);
        const jMax=Math.max(targetBbox.x,targetBbox.y,targetBbox.z);
        if (mMax>0 && jMax>0) model.scale.setScalar(jMax/mMax);
      }

      const box=new THREE.Box3().setFromObject(model), ctr=new THREE.Vector3(); box.getCenter(ctr);
      model.position.set(-ctr.x,-box.min.y,-ctr.z);
      model.traverse((obj:any)=>{ obj.frustumCulled = false; });
      resolve({model});
    }, undefined, reject);
  });
}

function getViews() {
  return [
    {name:'ISO_TOP_FRONT_RIGHT',dir:[ 1,0.82, 1]},{name:'ISO_TOP_FRONT_LEFT',dir:[-1,0.82, 1]},
    {name:'ISO_TOP_REAR_RIGHT', dir:[ 1,0.82,-1]},{name:'ISO_TOP_REAR_LEFT', dir:[-1,0.82,-1]},
    {name:'FRONT',dir:[0,0,1]},{name:'BACK',dir:[0,0,-1]},{name:'LEFT',dir:[-1,0,0]},
    {name:'RIGHT',dir:[1,0,0]},{name:'TOP',dir:[0,1,0]},{name:'BOTTOM',dir:[0,-1,0]},
  ] as const;
}
function viewLabel(name: string) {
  return name.replace(/^ISO_TOP_/,'').replace(/_/g,' ')
    .split(' ').map(w=>w[0].toUpperCase()+w.slice(1).toLowerCase()).join(' ');
}

// ── Assembly classification helpers ──────────────────────────────
// Same assembly_id + identical plan dims → LAMINATE (flush, suppress seam edges, no step ring)
// Same assembly_id + different plan dims → STEP ASSEMBLY (ledge ring drawn)
function isLaminateGroup(pieces: any[]): boolean {
  if (pieces.length < 2) return false;
  const ref = pieces[0].plank_dimensions_mm;
  return pieces.every((p: any) =>
    p.is_laminate_sheet === true ||
    (Math.abs((p.plank_dimensions_mm.length ?? 0) - (ref.length ?? 0)) < 1.0 &&
     Math.abs((p.plank_dimensions_mm.width  ?? 0) - (ref.width  ?? 0)) < 1.0)
  );
}
// isStepGroup (v25.16): same assembly_id, same face, at least one piece with different plan dims.
// Used to draw seam lines at step-assembly plank boundaries.
function isStepGroup(pieces: any[]): boolean {
  if (pieces.length < 2) return false;
  const ref = pieces[0].plank_dimensions_mm;
  const allSameFace = pieces.every((p: any) => p.face === pieces[0].face);
  const anyDifferentDims = pieces.some((p: any) =>
    Math.abs((p.plank_dimensions_mm.length ?? 0) - (ref.length ?? 0)) >= 1.0 ||
    Math.abs((p.plank_dimensions_mm.width  ?? 0) - (ref.width  ?? 0)) >= 1.0
  );
  return allSameFace && anyDifferentDims;
}

// ── Component ─────────────────────────────────────────────────────
interface FoamVisualizerProps {
  conceptJson: any;
  /** Compact mode: smaller canvas, no script panel, no view thumbnails */
  compact?: boolean;
}

export function FoamVisualizer({ conceptJson, compact = false }: FoamVisualizerProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const rafRef         = useRef<number>(0);
  const rendererRef    = useRef<any>(null);
  const sceneRef       = useRef<any>(null);
  const cameraRef      = useRef<any>(null);
  const ctrlRef        = useRef<any>(null);
  const objectsRef     = useRef<any[]>([]);
  const explodedRef    = useRef(true);
  const jsonRef        = useRef<any>(null);
  const glbUrlRef      = useRef<string|null>(null);
  const glbRawModelRef = useRef<any>(null);
  const manualRotRef   = useRef(0);
  const productBBoxRef = useRef({x:300,y:300,z:500});

  const [status,         setStatus]         = useState('');
  const [visible,        setVisible]        = useState(false);
  const [exploded,       setExploded]       = useState(true);
  const [ready,          setReady]          = useState(false);
  const [viewThumbnails, setViewThumbnails] = useState<{name:string;label:string;dataUrl:string}[]>([]);
  const [showScript,     setShowScript]     = useState(false);
  const [scriptText,     setScriptText]     = useState('');
  const [scriptStatus,   setScriptStatus]   = useState<{msg:string;ok:boolean}|null>(null);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); rendererRef.current?.dispose(); }, []);

  async function buildScene(json: any, isExploded: boolean, glbUrl: string|null = null) {
    const THREE = _THREE;
    if (!THREE || !containerRef.current) return;

    if (!rendererRef.current) {
      const gl = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
      gl.setPixelRatio(window.devicePixelRatio); gl.setClearColor(0xFFFFFF,1); gl.localClippingEnabled=true;
      gl.sortObjects = false; // v25.36: renderOrder strictly respected, no depth-sort override
      containerRef.current.appendChild(gl.domElement);
      rendererRef.current = gl;
    }
    const gl = rendererRef.current;
    const cW = containerRef.current.clientWidth||800, cH = containerRef.current.clientHeight||480;
    gl.setSize(cW, cH);

    if (!sceneRef.current) {
      const scene=new THREE.Scene();
      // 3-light rig (v25): high-intensity neutral sun + cool-tinted fill + warm rim.
      // The blue fill creates cold/warm contrast that makes foam depth read more clearly.
      scene.add(new THREE.AmbientLight(0xFFF8EE,0.60)); // v25.23: ambient lifted slightly for better readability
      const d1=new THREE.DirectionalLight(0xFFFFFF,0.90); d1.position.set(1,2,1.5); d1.castShadow=true; scene.add(d1);
      const d2=new THREE.DirectionalLight(0xE8F0FF,0.35); d2.position.set(-1,0.5,-1); scene.add(d2);
      // v25.42: rim light from below removed — caused cylinder underside to appear as phantom rectangle
      sceneRef.current=scene;
    }
    if (!cameraRef.current) {
      const a=cW/cH, f=2000;
      cameraRef.current=new THREE.OrthographicCamera(-f*a/2,f*a/2,f/2,-f/2,-100000,100000);
    }
    if (!ctrlRef.current) {
      ctrlRef.current=new THREE.OrbitControls(cameraRef.current,gl.domElement);
      ctrlRef.current.enableDamping=true; ctrlRef.current.dampingFactor=0.07;

      // ── Zoom fix for orthographic cameras ──────────────────────────────
      // OrbitControls zooms orthographic cameras by changing camera.zoom and
      // calling updateProjectionMatrix(). The GPU clip space then narrows,
      // clipping geometry even though frustumCulled=false bypasses JS culling.
      //
      // FIX: Disable OrbitControls zoom entirely and intercept the wheel event
      // to directly scale the frustum bounds (left/right/top/bottom).
      // camera.zoom stays 1 forever — no projection matrix narrowing at all.
      ctrlRef.current.enableZoom = false;

      gl.domElement.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const cam = cameraRef.current;
        if (!cam) return;
        // Scale frustum bounds directly — zoom in = shrink bounds, zoom out = grow bounds.
        // Clamp total range so user can't zoom out to infinity or in past the model.
        const currentRange = cam.right - cam.left;
        const factor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
        const newRange = currentRange * factor;
        // Clamp: min 50 units (extreme close-up), max 30000 units (very far out)
        if (newRange < 50 || newRange > 30000) return;
        cam.left   *= factor;
        cam.right  *= factor;
        cam.top    *= factor;
        cam.bottom *= factor;
        cam.updateProjectionMatrix();
      }, { passive: false });
    }

    const scene=sceneRef.current, cam=cameraRef.current, ctrl=ctrlRef.current;

    // Clear previous foam
    objectsRef.current.forEach((o:any)=>{ o.traverse((c:any)=>{ if(c.geometry) c.geometry.dispose(); if(c.material){ if(Array.isArray(c.material)) c.material.forEach((m:any)=>m.dispose()); else c.material.dispose(); } }); scene.remove(o); }); objectsRef.current=[];
    const prevProd=(scene as any).__productObj;
    if(prevProd){scene.remove(prevProd);(scene as any).__productObj=null;}

    const foamColor=json.material_selection?.foam_colour_hex??json.product_visual?.foam_colour_hex??'#EDE8E0';
    // White background: cream foam (#EDE8E0) on grey (#E8E8E8) had near-zero contrast.
    // On white, cream reads clearly as warm off-white.
    gl.setClearColor(0xFFFFFF, 1);
    const spacing=Math.max(json.scene_composition?.threejs_explode_spacing_mm??120, 150);
    const pieces=json.foam_pieces??[];

    // Cavity dark factors from JSON (v25.10) — read once before building planks
    const _sc = json.scene_composition ?? {};
    _cavWallF  = _sc.threejs_cavity_wall_dark_factor  ?? 0.50;
    _cavFloorF = _sc.threejs_cavity_floor_dark_factor ?? 0.32;

    // productBBox is always sourced from the concept JSON — never derived from the
    // post-rotation 3D size, which would give wrong X/Z values after a Y-spin.
    if(json.product_bbox_mm){const b=normaliseBbox(json.product_bbox_mm);productBBoxRef.current={x:b.x,y:b.y,z:b.z};}
    const bbox=productBBoxRef.current;
    // NaN guard: only use carton dims when all three are finite numbers (v25.10)
    const _rawCarton = json.expak_selection?.carton_internal_dimensions_mm as any;
    const carton: {x:number,y:number,z:number} = (_rawCarton && isFinite(_rawCarton.x) && isFinite(_rawCarton.y) && isFinite(_rawCarton.z))
      ? _rawCarton
      : { x: bbox.x + 120, y: bbox.y + 120, z: bbox.z + 120 };

    let glbStatus = glbUrl ? '⏳ loading GLB…' : '⚠ no GLB';
    if(glbUrl){
      try{
        if(!THREE.GLTFLoader) throw new Error('GLTFLoader not available');
        const glbHeightAxis=json.scene_composition?.glb_height_axis??json.scene_composition?.glb_up_axis??'+Z';
        const targetBbox=json.product_bbox_mm?normaliseBbox(json.product_bbox_mm):undefined;
        const {model}=await loadGLBProduct(THREE,glbUrl,glbHeightAxis,manualRotRef.current,glbRawModelRef.current,targetBbox);
        glbRawModelRef.current=model; scene.add(model); (scene as any).__productObj=model;
        // Never update productBBoxRef from the model — use JSON bbox only (see comment above)
        glbStatus = '✓ GLB model';
      }catch(e:any){
        console.error('GLB error:',e);
        glbStatus = `✗ GLB: ${e?.message??String(e)}`;
      }
    }

    // Group pieces by assembly_id for step-assembly landing rings
    const assemblyGroups: Record<string, any[]> = {};
    pieces.forEach((piece: any) => {
      const aId = piece.assembly_id || piece.id;
      if (!assemblyGroups[aId]) assemblyGroups[aId] = [];
      assemblyGroups[aId].push(piece);
    });

    // Pre-compute which assembly groups are laminate (v25.10):
    // same plan dims = flush sheets → suppress inner-seam wireframes, skip step ring
    const laminateGroupIds = new Set<string>();
    Object.entries(assemblyGroups).forEach(([aId, grpPieces]) => {
      if (isLaminateGroup((grpPieces as any[]).map(normalisePiece))) laminateGroupIds.add(aId);
    });

    // Pre-compute total bottom foam stack height = max(layerOff + H) over all bottom pieces.
    // Used by getPlacement to correctly position step-assembly layers without overlap.
    const totalBottom = pieces
      .filter((p: any) => (p.face ?? '').toLowerCase() === 'bottom')
      .reduce((mx: number, p: any) => {
        const np = normalisePiece(p);
        return Math.max(mx, (np.layer_offset_from_face_mm || 0) + np.plank_dimensions_mm.height);
      }, 0) || 50;

    let maxExtent = Math.max(bbox.x, bbox.y, bbox.z);
    pieces.forEach((piece:any)=>{
      const np=normalisePiece(autoInjectSeatPocket(piece, bbox));
      const {pos,rot,contactDir}=getPlacement(np,bbox,spacing,isExploded,totalBottom,carton);
      const grp=buildPlank(THREE,np,contactDir,foamColor);

      // v25.38: intraOff=0 — pieces within same assembly stay physically adjacent.
      // Explode moves ASSEMBLIES away from the product as a unit; the seam ribbon
      // (below) marks the cap/cavity boundary without creating floating gaps.

      grp.position.set(...pos); grp.rotation.set(...rot);
      // Disable frustum culling — prevents objects vanishing when zoomed in
      // with an orthographic camera (narrow frustum clips bounding spheres)
      grp.traverse((obj:any)=>{ obj.frustumCulled = false; });
      // All planks: body mesh gets DoubleSide so foam reads as solid from any camera angle (v25.13).
      // Wall/floor materials excluded via polygonOffset flag — DoubleSide on liners caused transparency.
      grp.traverse((child: any) => {
        if (child.isMesh && child.material && !child.material.polygonOffset) {
          child.material = child.material.clone();
          child.material.side = THREE.DoubleSide;
        }
      });
      scene.add(grp); objectsRef.current.push(grp);
      // Face border outlines (v25.35): only on OUTERMOST exposed faces per assembly.
      // Outboard piece → outboard face border only.
      // Inboard piece  → inboard face border only (toward product).
      // Middle pieces  → no borders.
      // Single piece   → both borders.
      // This eliminates the visual "notch/tab" artifact at cap-cavity interfaces.
      {
        const bL = np.plank_dimensions_mm?.length ?? 400;
        const bW = np.plank_dimensions_mm?.width  ?? 400;
        const bH = np.plank_dimensions_mm?.height ?? 50;
        const hx2 = bL / 2, hz2 = bW / 2, hh2 = bH / 2;
        const chamferCut2 = (np.cut_features || []).find((c: any) => c.plan_chamfer === true);
        const chX2 = chamferCut2 ? Math.min((chamferCut2.dimensions_mm?.length || 40), hx2 * 0.44) : 0;
        const chZ2 = chamferCut2 ? Math.min((chamferCut2.dimensions_mm?.width  || 40), hz2 * 0.44) : 0;
        const bPts2: [number,number][] = chX2 > 0
          ? [[-hx2+chX2,-hz2],[hx2-chX2,-hz2],[hx2,-hz2+chZ2],[hx2,hz2-chZ2],
             [hx2-chX2,hz2],[-hx2+chX2,hz2],[-hx2,hz2-chZ2],[-hx2,-hz2+chX2]]
          : [[-hx2,-hz2],[hx2,-hz2],[hx2,hz2],[-hx2,hz2]];
        const borderMat2 = new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.30) }); // v25.35

        // Assembly-aware border face selection (v25.35)
        const _bAsmId = np.assembly_id || np.id;
        const _bAsmPieces = (assemblyGroups[_bAsmId] ?? []).map(normalisePiece);
        const _bSorted = [..._bAsmPieces].sort((a: any, b: any) =>
          (a.layer_offset_from_face_mm || 0) - (b.layer_offset_from_face_mm || 0));
        const _bIdx = _bSorted.findIndex((p: any) =>
          (p.layer_offset_from_face_mm || 0) === (np.layer_offset_from_face_mm || 0));
        const _bN = _bSorted.length;
        const _bFace = (np.face ?? '').toLowerCase();
        const _bIsSide = ['left','right','end_left','end_right','front','back','end_front','end_back'].includes(_bFace);
        let drawTopBorder: boolean, drawBotBorder: boolean;
        if (_bN <= 1) {
          if (_bIsSide) {
            // v25.46: single-piece side-face plank (Pattern G end-cap disc):
            // Suppress ALL border lines — both outboard and inboard.
            // The outboard border ring at the carton-wall face projects from face-on
            // camera angles as: (a) triangular flat shapes at each chamfered corner,
            // and (b) a "two nested discs" illusion where the back-face ring appears
            // as a smaller darker disc behind the body. The chamfered 3D octagonal
            // body geometry is self-documenting — no border lines needed.
            drawTopBorder = false;
            drawBotBorder = false;
          } else {
            // v25.44: flat slab guard — if height < 12% of plan dimension (e.g. a large
            // thin cap sheet like 756×638×30 mm) suppress ALL border lines.
            // Both the inboard AND outboard rings appear as phantom flat floating sheets
            // from isometric camera angles on large-footprint slabs. The chamfered 3D
            // body edges already show the slab boundary clearly without border lines.
            const _bMaxPlan = Math.max(bL, bW);
            const _bIsFlat  = bH < _bMaxPlan * 0.12;
            if (_bIsFlat) {
              drawTopBorder = false; drawBotBorder = false;
            } else {
              drawTopBorder = true; drawBotBorder = true;
            }
          }
        } else if (_bIdx === 0) {
          // Outboard piece: only the carton-wall-facing border
          if (_bIsSide) {
            // v25.47: side-face multi-piece → suppress all borders (same as single-piece).
            drawTopBorder = false; drawBotBorder = false;
          } else {
            // v25.48: flat-slab guard for multi-piece outboard too
            const _mp = Math.max(bL, bW);
            const _flat = bH < _mp * 0.12;
            drawTopBorder = _flat ? false : (_bFace === 'top');
            drawBotBorder = _flat ? false : (_bFace === 'bottom');
          }
        } else if (_bIdx === _bN - 1) {
          // Inboard piece: only the product-facing border
          if (_bIsSide) {
            drawTopBorder = false; drawBotBorder = false;
          } else {
            // v25.48: flat-slab guard for multi-piece inboard too
            const _mp = Math.max(bL, bW);
            const _flat = bH < _mp * 0.12;
            drawTopBorder = _flat ? false : (_bFace === 'bottom');
            drawBotBorder = _flat ? false : (_bFace === 'top');
          }
        } else {
          // Middle pieces: no borders (fully internal)
          drawTopBorder = false; drawBotBorder = false;
        }

        const borderYOffs: number[] = [];
        if (drawTopBorder) borderYOffs.push(+hh2);
        if (drawBotBorder) borderYOffs.push(-hh2);
        for (const yOff of borderYOffs) {
          const pts3 = bPts2.map(([x, z]) => new THREE.Vector3(x, yOff, z));
          pts3.push(pts3[0].clone()); // close the loop
          const borderLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), borderMat2);
          borderLine.frustumCulled = false;
          borderLine.renderOrder = 4;
          grp.add(borderLine);
        }
      }
      // Laminate: suppress inner-sheet wireframe seams (v25.10)
      const _aId = np.assembly_id || np.id;
      if (laminateGroupIds.has(_aId) && np.laminate_role === 'inner') {
        grp.traverse((child: any) => { if (child.isLineSegments) child.visible = false; });
      }
      // Strata bond lines: outline rectangle at sheet joint for non-topmost laminate sheets
      // 0.98 scale keeps it fractionally inside the edge to avoid z-fighting (v25.10)
      if (np.laminate_sheet_index != null && np.laminate_total_sheets != null &&
          np.laminate_sheet_index !== np.laminate_total_sheets) {
        const bH = np.plank_dimensions_mm?.height ?? 50;
        const bL = np.plank_dimensions_mm?.length ?? 400;
        const bW = np.plank_dimensions_mm?.width  ?? 400;
        const bhl = bL * 0.98 / 2, bhw = bW * 0.98 / 2;
        const bondMat = new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.40) });
        const bondLine1 = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-bhl, bH / 2, 0),
            new THREE.Vector3( bhl, bH / 2, 0),
          ]),
          bondMat
        );
        bondLine1.frustumCulled = false;
        grp.add(bondLine1);
        const bondLine2 = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, bH / 2, -bhw),
            new THREE.Vector3(0, bH / 2,  bhw),
          ]),
          bondMat
        );
        bondLine2.frustumCulled = false;
        grp.add(bondLine2);
      }
      // v25.53: Outboard face dark cover — dark octagonal plane at carton-wall face of
      // outboard/single pieces. Prevents the bottom slab appearing as a floating grey rectangle.
      {
        const _dcAsmId = np.assembly_id || np.id;
        const _dcAsmPcs = (assemblyGroups[_dcAsmId] ?? []).map(normalisePiece);
        const _dcSorted = [..._dcAsmPcs].sort((a: any, b: any) => (a.layer_offset_from_face_mm || 0) - (b.layer_offset_from_face_mm || 0));
        const _dcIdx = _dcSorted.findIndex((p: any) => (p.layer_offset_from_face_mm || 0) === (np.layer_offset_from_face_mm || 0));
        if (_dcAsmPcs.length <= 1 || _dcIdx === 0) {
          const _dcFace = (np.face ?? '').toLowerCase();
          const _dcL = np.plank_dimensions_mm?.length ?? 400;
          const _dcW = np.plank_dimensions_mm?.width  ?? 400;
          const _dcH = np.plank_dimensions_mm?.height ?? 50;
          const _dcSch = (np.cut_features || []).find((c: any) => c.plan_chamfer === true);
          const _dcCX = _dcSch ? (dv(_dcSch.dimensions_mm ?? {}, 'length', 'width') || 0) : 0;
          const _dcCZ = _dcSch ? (dv(_dcSch.dimensions_mm ?? {}, 'width', 'length') || 0) : 0;
          const _dcHX = _dcL * 0.998 / 2, _dcHZ = _dcW * 0.998 / 2;
          const _dcCXc = _dcCX > 0 ? Math.min(_dcCX, _dcHX * 0.44) : 0;
          const _dcCZc = _dcCZ > 0 ? Math.min(_dcCZ, _dcHZ * 0.44) : 0;
          const _dcPts: [number, number][] = _dcCXc > 0
            ? [[-_dcHX+_dcCXc,-_dcHZ],[_dcHX-_dcCXc,-_dcHZ],[_dcHX,-_dcHZ+_dcCZc],[_dcHX,_dcHZ-_dcCZc],
               [_dcHX-_dcCXc,_dcHZ],[-_dcHX+_dcCXc,_dcHZ],[-_dcHX,_dcHZ-_dcCZc],[-_dcHX,-_dcHZ+_dcCXc]]
            : [[-_dcHX,-_dcHZ],[_dcHX,-_dcHZ],[_dcHX,_dcHZ],[-_dcHX,_dcHZ]];
          const _dcVs: number[] = [];
          for (const [rx, rz] of _dcPts) _dcVs.push(rx, 0, rz);
          const _dcN2 = _dcPts.length;
          const _dcIx: number[] = [];
          for (let _i = 1; _i < _dcN2 - 1; _i++) _dcIx.push(0, _i, _i + 1);
          const _dcGeo = new THREE.BufferGeometry();
          _dcGeo.setAttribute('position', new THREE.Float32BufferAttribute(_dcVs, 3));
          _dcGeo.setIndex(_dcIx);
          _dcGeo.computeVertexNormals();
          const _dcMat = new THREE.MeshBasicMaterial({ color: dark(THREE, foamColor, 0.18), side: THREE.FrontSide });
          const _dcMesh = new THREE.Mesh(_dcGeo, _dcMat);
          _dcMesh.renderOrder = 0;
          _dcMesh.frustumCulled = false;
          if (_dcFace === 'bottom') {
            _dcMesh.rotation.set(-Math.PI / 2, 0, 0);
            _dcMesh.position.set(pos[0], pos[1] - _dcH / 2 + 0.1, pos[2]);
          } else if (_dcFace === 'top') {
            _dcMesh.rotation.set(-Math.PI / 2, 0, 0);
            _dcMesh.position.set(pos[0], pos[1] + _dcH / 2 - 0.1, pos[2]);
          } else if (_dcFace === 'left' || _dcFace === 'end_left') {
            _dcMesh.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
            _dcMesh.position.set(pos[0] - _dcH / 2 + 0.1, pos[1], pos[2]);
          } else if (_dcFace === 'right' || _dcFace === 'end_right') {
            _dcMesh.rotation.set(Math.PI / 2, Math.PI / 2, 0);
            _dcMesh.position.set(pos[0] + _dcH / 2 - 0.1, pos[1], pos[2]);
          }
          scene.add(_dcMesh);
          objectsRef.current.push(_dcMesh);
        }
      }
      // Seam ribbon (v25.38): 4 BoxGeometry panels forming a 4mm-tall perimeter ribbon
      // at the cap/cavity interface. Physical thickness = visible from ALL camera angles,
      // including edge-on views where a zero-width Line disappears entirely.
      {
        const _sAsmId = np.assembly_id || np.id;
        const _sAsmPieces = (assemblyGroups[_sAsmId] ?? []).map(normalisePiece);
        const _sSorted = [..._sAsmPieces].sort((a:any,b:any)=>(a.layer_offset_from_face_mm||0)-(b.layer_offset_from_face_mm||0));
        const _sIdx = _sSorted.findIndex((p:any)=>(p.layer_offset_from_face_mm||0)===(np.layer_offset_from_face_mm||0));
        if (_sAsmPieces.length > 1 && _sIdx > 0) {
          const _sFace = (np.face ?? '').toLowerCase();
          const _sL = np.plank_dimensions_mm?.length ?? 400;
          const _sW = np.plank_dimensions_mm?.width  ?? 400;
          const _sH = np.plank_dimensions_mm?.height ?? 50;
          const sl = _sL * 0.997, sw = _sW * 0.997;

          if (_sFace === 'bottom' || _sFace === 'top') {
            // Physical interface Y = inboard face of the outboard (cap) piece
            const _sPrevPiece = _sSorted[_sIdx - 1];
            const _sPrevNp = normalisePiece(_sPrevPiece);
            const _sPrevH = _sPrevNp.plank_dimensions_mm?.height ?? 50;
            const _sPrevLayOff = _sPrevNp.layer_offset_from_face_mm ?? 0;
            const _gap = isExploded ? spacing : 0;
            let jY: number;
            if (_sFace === 'bottom') {
              const _sPrevPosY = -(carton.z / 2) - _gap + _sPrevLayOff + _sPrevH / 2;
              jY = _sPrevPosY + _sPrevH / 2;
            } else {
              const _sPrevPosY = (carton.z / 2) + _gap - _sPrevLayOff - _sPrevH / 2;
              jY = _sPrevPosY - _sPrevH / 2;
            }
            // v25.51: octagonal LINE ring at jY traces the exact plank perimeter shape.
            // Replaces BoxGeometry panels which had visible top faces creating flat
            // protrusions at chamfer corners from isometric camera angles.
            const _seamSch = (np.cut_features || []).find((c: any) => c.plan_chamfer === true);
            const _seamScX = _seamSch ? (dv(_seamSch.dimensions_mm ?? {}, 'length', 'width') || 0) : 0;
            const _seamScZ = _seamSch ? (dv(_seamSch.dimensions_mm ?? {}, 'width', 'length') || 0) : 0;
            const _srHX = sl / 2, _srHZ = sw / 2;
            const _srCX = _seamScX > 0 ? Math.min(_seamScX, _srHX * 0.44) : 0;
            const _srCZ = _seamScZ > 0 ? Math.min(_seamScZ, _srHZ * 0.44) : 0;
            const _ringPts2D: [number, number][] = _srCX > 0
              ? [[-_srHX+_srCX,-_srHZ],[_srHX-_srCX,-_srHZ],[_srHX,-_srHZ+_srCZ],[_srHX,_srHZ-_srCZ],
                 [_srHX-_srCX,_srHZ],[-_srHX+_srCX,_srHZ],[-_srHX,_srHZ-_srCZ],[-_srHX,-_srHZ+_srCX]]
              : [[-_srHX,-_srHZ],[_srHX,-_srHZ],[_srHX,_srHZ],[-_srHX,_srHZ]];
            const _ringPts3D = _ringPts2D.map(([rx, rz]) => new THREE.Vector3(pos[0] + rx, jY, pos[2] + rz));
            _ringPts3D.push(_ringPts3D[0].clone());
            const _seamLine = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(_ringPts3D),
              new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.28) })
            );
            _seamLine.frustumCulled = false;
            _seamLine.renderOrder = 6;
            scene.add(_seamLine);
            objectsRef.current.push(_seamLine);

          } else if (_sFace === 'left' || _sFace === 'end_left' || _sFace === 'right' || _sFace === 'end_right') {
            // v25.48: side-face seam — octagonal LINE ring in the YZ-plane at the
            // physical interface between cap and cavity pieces.
            // Piece is rotated 90°z: local length → world Y, local width → world Z, local height → world X.
            const jX = (_sFace === 'left' || _sFace === 'end_left')
              ? pos[0] - _sH / 2
              : pos[0] + _sH / 2;
            const seamLineMat = new THREE.LineBasicMaterial({ color: dark(THREE, foamColor, 0.34) });
            // Chamfer for the ring shape (use same clamped logic as border outline)
            const _sch2 = (np.cut_features || []).find((c: any) => c.plan_chamfer === true);
            const _scRaw = _sch2 ? (dv(_sch2.dimensions_mm ?? {}, 'length', 'width') || 25) : 0;
            const hy2 = sl / 2, hz2 = sw / 2; // half-extents in world Y and Z
            const cy2 = _scRaw > 0 ? Math.min(_scRaw, hy2 * 0.44) : 0;
            const cz2 = _scRaw > 0 ? Math.min(_scRaw, hz2 * 0.44) : 0;
            // Octagonal ring points (YZ plane), mapped to world coords
            const octPts2: [number, number][] = cy2 > 0
              ? [[-hy2+cy2,-hz2],[hy2-cy2,-hz2],[hy2,-hz2+cz2],[hy2,hz2-cz2],
                 [hy2-cy2,hz2],[-hy2+cy2,hz2],[-hy2,hz2-cz2],[-hy2,-hz2+cy2]]
              : [[-hy2,-hz2],[hy2,-hz2],[hy2,hz2],[-hy2,hz2]];
            const ringPts2 = [...octPts2, octPts2[0]].map(([y, z]) =>
              new THREE.Vector3(jX, pos[1] + y, pos[2] + z));
            const ringLine2 = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(ringPts2),
              seamLineMat
            );
            ringLine2.frustumCulled = false;
            ringLine2.renderOrder = 5;
            scene.add(ringLine2);
            objectsRef.current.push(ringLine2);
          }
        }
      }

      // Face-aware maxExtent: account for 90° rotation of side/front/back planks
      const face_=(np.face??'').toLowerCase();
      const lenX_=np.plank_dimensions_mm?.length??400;
      const lenZ_=np.plank_dimensions_mm?.width??400;
      const H_=np.plank_dimensions_mm?.height??50;
      if(face_==='left'||face_==='end_left'||face_==='right'||face_==='end_right'){
        maxExtent=Math.max(maxExtent,Math.abs(pos[0])+H_/2,Math.abs(pos[1])+lenX_/2,Math.abs(pos[2])+lenZ_/2);
      }else if(face_==='front'||face_==='end_front'||face_==='back'||face_==='end_back'){
        maxExtent=Math.max(maxExtent,Math.abs(pos[0])+lenX_/2,Math.abs(pos[1])+H_/2,Math.abs(pos[2])+lenZ_/2);
      }else{
        maxExtent=Math.max(maxExtent,Math.abs(pos[0])+lenX_/2,Math.abs(pos[1])+H_/2,Math.abs(pos[2])+lenZ_/2);
      }
    });

    // Contact highlight removed (v25.42): BoxGeometry slabs at Y=±bbox.z/2 appeared as a
    // large flat platform (bottom) and a line crossing the product barrel (top) from the
    // side end-cap camera angle. Removed — the foam cavity liners provide sufficient depth cues.

    // Step assembly ShapeGeometry ledge removed in v25.32 — unified seam lines handle all assembly boundaries.

    // Also disable on product GLB
    if ((scene as any).__productObj) {
      (scene as any).__productObj.traverse((obj:any)=>{ obj.frustumCulled = false; });
    }

    const {cY,S: baseS}=getSceneExtents(), a=cW/cH;
    const S=Math.max(baseS, maxExtent*1.4);
    cam.left=-S*a/2; cam.right=S*a/2; cam.top=S/2; cam.bottom=-S/2; cam.near=-100000; cam.far=100000;
    cam.updateProjectionMatrix();

    // v25.4: adaptive camera angle based on dominant foam face layout
    const hasSideFaces = pieces.some((p: any) => {
      const f = (p.face ?? '').toLowerCase();
      return f === 'left' || f === 'right' || f === 'end_left' || f === 'end_right';
    });
    const hasFrontBackFaces = pieces.some((p: any) => {
      const f = (p.face ?? '').toLowerCase();
      return f === 'front' || f === 'back' || f === 'end_front' || f === 'end_back';
    });
    let camX: number, camY: number, camZ: number;
    if (hasSideFaces && !hasFrontBackFaces) {
      // v25.42: slight positive X offset, marginally higher + closer for side end-caps
      camX = S * 0.10; camY = S * 0.30; camZ = S * 1.5;
    } else if (hasFrontBackFaces && !hasSideFaces) {
      // v25.40: low-elevation side view shows front/back end-caps face-on at eye level
      camX = S * 1.6; camY = S * 0.25; camZ = -S * 0.15;
    } else {
      // Standard top/bottom layout — elevated angle shows pocket on bottom slab top face
      camX = S * 1.0; camY = cY + S * 1.2; camZ = S * 1.0;
    }
    // v25.40: lookAt world origin (Y=0) for all layout types — product centred in view
    const lookY = 0;
    cam.position.set(camX, camY, camZ); cam.lookAt(0, lookY, 0);
    ctrl.target.set(0, lookY, 0); ctrl.update();

    cancelAnimationFrame(rafRef.current);
    const loop=()=>{rafRef.current=requestAnimationFrame(loop);ctrl.update();gl.render(scene,cam);};
    loop();

    setStatus(
      `v25.53 · ${json.meta?.product_id??'product'} · ${json.meta?.cushion_type_selected??''}\n`+
      `${pieces.length} foam piece${pieces.length!==1?'s':''} · ${glbStatus}`
    );
  }

  function getSceneExtents() {
    const bbox=productBBoxRef.current, json=jsonRef.current, pieces=json?.foam_pieces??[];
    const spacing=json?.scene_composition?.threejs_explode_spacing_mm??120, gap=explodedRef.current?spacing:0;
    let maxTh=50, maxW=Math.max(bbox.x,bbox.y);
    pieces.forEach((p:any)=>{const np=normalisePiece(p);maxTh=Math.max(maxTh,np.plank_dimensions_mm.height);maxW=Math.max(maxW,np.plank_dimensions_mm.length,np.plank_dimensions_mm.width);});
    const pH=bbox.z, botY=-(gap+maxTh), topY=pH+gap+maxTh, cY=(botY+topY)/2, S=Math.max(topY-botY,maxW)*1.15;
    return {cY,S};
  }

  function setView(dir: readonly number[], cY: number, S: number) {
    const cam=cameraRef.current, ctrl=ctrlRef.current, gl=rendererRef.current; if(!cam||!ctrl||!gl)return;
    const [dx,dy,dz]=dir, dist=S*1.5, a=gl.domElement.width/gl.domElement.height;
    cam.left=-S*a/2; cam.right=S*a/2; cam.top=S/2; cam.bottom=-S/2; cam.near=-100000; cam.far=100000;
    cam.updateProjectionMatrix();
    cam.position.set(dx*dist,cY+dy*dist,dz*dist); cam.lookAt(0,cY,0); cam.up.set(0,1,0);
    ctrl.target.set(0,cY,0);
  }

  async function handleRender() {
    setStatus('Loading Three.js…'); setVisible(true); setReady(false); setViewThumbnails([]);

    const productId=(conceptJson as any).meta?.product_id;
    if(productId){
      try{
        const {createClient}=await import('@/lib/supabase/client');
        const supabase=createClient();
        const isUuid=/^[0-9a-f-]{36}$/i.test(productId);
        const {data:product}=isUuid
          ?await supabase.from('products').select('glb_url').eq('id',productId).maybeSingle()
          :await supabase.from('products').select('glb_url').ilike('name',`%${productId}%`).limit(1).maybeSingle();
        if(product?.glb_url){
          // GLBs are stored in the 'generated-images' bucket (see ProductsManager.tsx)
          const {data:signed}=await supabase.storage.from('generated-images').createSignedUrl(product.glb_url,3600);
          if(signed?.signedUrl){
            glbUrlRef.current=signed.signedUrl;
          } else {
            const {data:urlData}=supabase.storage.from('generated-images').getPublicUrl(product.glb_url);
            glbUrlRef.current=urlData.publicUrl;
          }
        }else{glbUrlRef.current=null;}
      }catch{glbUrlRef.current=null;}
    }else{glbUrlRef.current=null;}

    try {
      if(!_THREE) await getThree();
      glbRawModelRef.current=null; manualRotRef.current=0; jsonRef.current=conceptJson;
      await buildScene(conceptJson,explodedRef.current,glbUrlRef.current);
      setReady(true);
      await generateThumbnails();
    } catch(err: any) {
      setStatus(`⚠ Render error: ${err?.message ?? String(err)}`);
      console.error('[FoamVisualizer] render error', err);
    }
  }

  function handleToggle() {
    explodedRef.current=!explodedRef.current; setExploded(explodedRef.current);
    if(jsonRef.current)buildScene(jsonRef.current,explodedRef.current,glbUrlRef.current);
  }
  function handleRotate() {
    manualRotRef.current=(manualRotRef.current+1)%4;
    if(jsonRef.current)buildScene(jsonRef.current,explodedRef.current,glbUrlRef.current);
  }
  function handleExport() {
    if(!rendererRef.current||!sceneRef.current||!cameraRef.current)return;
    rendererRef.current.render(sceneRef.current,cameraRef.current);
    const a=document.createElement('a'); a.download=`foam-${Date.now()}.png`;
    a.href=rendererRef.current.domElement.toDataURL('image/png'); a.click();
  }

  async function handleExportAllViews() {
    const gl=rendererRef.current,cam=cameraRef.current,ctrl=ctrlRef.current;
    if(!gl||!cam||!ctrl||!sceneRef.current)return;
    const views=getViews(), {cY,S}=getSceneExtents();
    const id=(jsonRef.current as any)?.meta?.product_id??'product', suffix=explodedRef.current?'exploded':'assembled';
    const savedPos=cam.position.clone(),savedTarget=ctrl.target.clone();
    const savedL=cam.left,savedR=cam.right,savedT=cam.top,savedB=cam.bottom;
    setStatus(`Exporting ${views.length} views…`);
    for(let i=0;i<views.length;i++){
      setView(views[i].dir,cY,S); gl.render(sceneRef.current,cam);
      await new Promise(r=>setTimeout(r,80));
      const a=document.createElement('a'); a.download=`${id}_${suffix}_${views[i].name}.png`;
      a.href=gl.domElement.toDataURL('image/png'); a.click();
      setStatus(`Exported ${i+1}/${views.length}: ${views[i].name}`);
    }
    cam.left=savedL;cam.right=savedR;cam.top=savedT;cam.bottom=savedB;cam.updateProjectionMatrix();
    cam.position.copy(savedPos);ctrl.target.copy(savedTarget);ctrl.update();gl.render(sceneRef.current,cam);
    setStatus(`✓ ${views.length} PNGs exported — check Downloads folder.`);
  }

  async function generateThumbnails() {
    const gl=rendererRef.current,cam=cameraRef.current,ctrl=ctrlRef.current;
    if(!gl||!cam||!ctrl||!sceneRef.current)return;
    const isoViews=getViews().filter(v=>v.name.startsWith('ISO_')), {cY,S}=getSceneExtents();
    const savedPos=cam.position.clone(),savedTarget=ctrl.target.clone(),savedUp=cam.up.clone();
    const savedL=cam.left,savedR=cam.right,savedT=cam.top,savedB=cam.bottom;
    const thumbs:{name:string;label:string;dataUrl:string}[]=[];
    for(const v of isoViews){
      setView(v.dir,cY,S); gl.render(sceneRef.current,cam);
      await new Promise(r=>setTimeout(r,60)); gl.render(sceneRef.current,cam);
      thumbs.push({name:v.name,label:viewLabel(v.name),dataUrl:gl.domElement.toDataURL('image/jpeg',0.85)});
    }
    cam.left=savedL;cam.right=savedR;cam.top=savedT;cam.bottom=savedB;cam.updateProjectionMatrix();
    cam.position.copy(savedPos);cam.up.copy(savedUp);ctrl.target.copy(savedTarget);ctrl.update();
    gl.render(sceneRef.current,cam); setViewThumbnails(thumbs);
  }

  function jumpToView(viewName: string) {
    const view=getViews().find(v=>v.name===viewName); if(!view)return;
    const {cY,S}=getSceneExtents(); setView(view.dir,cY,S); ctrlRef.current?.update();
  }

  async function runScript() {
    const raw=scriptText.trim(); if(!raw)return;
    try{
      let parsed:any; try{parsed=JSON.parse(raw);}catch(_){}
      if(parsed){
        jsonRef.current=parsed;
        await buildScene(parsed,explodedRef.current,glbUrlRef.current);
        setScriptStatus({msg:'✓ renderFoam() called',ok:true}); return;
      }
      const result=await(new Function('buildScene','jsonRef','explodedRef','glbUrlRef',`"use strict";\n${raw}`))(
        (j:any)=>buildScene(j,explodedRef.current,glbUrlRef.current),jsonRef,explodedRef,glbUrlRef
      );
      setScriptStatus({msg:result!==undefined?`✓ → ${JSON.stringify(result)}`:'✓ Done',ok:true});
    }catch(err:any){setScriptStatus({msg:`✗ ${err.message}`,ok:false});}
  }

  const hasFoamPieces=Array.isArray((conceptJson as any).foam_pieces)&&(conceptJson as any).foam_pieces.length>0;
  if(!hasFoamPieces)return null;

  return (
    <div className={compact ? 'w-full h-full' : 'mt-4 border-t pt-4 space-y-3'}>
      {/* Toolbar — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-medium text-gray-600">3D Foam Preview</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleRender}>
              {ready ? 'Re-render' : 'Render 3D Preview'}
            </Button>
            {ready && (<>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleToggle}>{exploded?'Assembled view':'Exploded view'}</Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleRotate}>Rotate 90°</Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleExport}>Export PNG</Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleExportAllViews}>Export All Views (10)</Button>
            </>)}
            <Button size="sm" variant={showScript?'default':'outline'}
              className={`text-xs h-7 ${showScript?'bg-blue-600 text-white hover:bg-blue-700':''}`}
              onClick={()=>{setShowScript(s=>!s);setScriptStatus(null);}}>
              {showScript?'Close Script':'Render Script'}
            </Button>
          </div>
        </div>
      )}

      {/* Script panel — hidden in compact mode */}
      {!compact && showScript && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-700">Render Script</p>
          <p className="text-xs text-gray-500">Paste concept JSON to re-render, or write JS using <code className="bg-white px-1 rounded border text-blue-600">buildScene(json)</code>.</p>
          <textarea value={scriptText} onChange={e=>setScriptText(e.target.value)}
            placeholder={'Paste concept JSON here…\nor: buildScene({ foam_pieces: [...] })'}
            rows={8} spellCheck={false}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-mono text-gray-800 shadow-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"/>
          <div className="flex items-center gap-2">
            <Button size="sm" className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white" onClick={runScript}>Run</Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={()=>{setScriptText(JSON.stringify(jsonRef.current??conceptJson,null,2));setScriptStatus(null);}}>Load current JSON</Button>
            <Button size="sm" variant="ghost" className="text-xs h-7 text-gray-400" onClick={()=>{setScriptText('');setScriptStatus(null);}}>Clear</Button>
            {scriptStatus&&<span className={`text-xs ml-1 ${scriptStatus.ok?'text-green-600':'text-red-500'}`}>{scriptStatus.msg}</span>}
          </div>
        </div>
      )}

      {/* Compact mode: minimal render button */}
      {compact && !ready && (
        <div className="flex items-center justify-center py-2">
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleRender}>
            Render 3D Preview
          </Button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`w-full overflow-hidden ${visible?'':'hidden'} ${compact?'':'rounded-lg border'}`}
        style={{ height: compact ? '100%' : 480, minHeight: compact ? 480 : undefined, background: '#FFFFFF' }}
      />

      {/* Status + thumbnails hidden in compact mode */}
      {!compact && status && <p className="text-xs text-gray-400 whitespace-pre-line">{status}</p>}

      {!compact && ready && viewThumbnails.length > 0 && (
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-3 min-w-max">
            {viewThumbnails.map(t=>(
              <button key={t.name} onClick={()=>jumpToView(t.name)} className="flex flex-col items-center gap-1 group" title={`Jump to ${t.label} view`}>
                <div className="w-28 h-20 rounded-md border border-gray-200 overflow-hidden transition-colors group-hover:border-blue-400 group-focus:border-blue-500">
                  <img src={t.dataUrl} alt={t.label} className="w-full h-full object-cover" draggable={false}/>
                </div>
                <span className="text-xs text-gray-500 group-hover:text-gray-800 transition-colors">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ready&&<p className="text-xs text-gray-400 text-center">Drag to orbit · Scroll to zoom · Right-drag to pan</p>}
    </div>
  );
}

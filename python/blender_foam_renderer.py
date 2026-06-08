"""
Nefab Foam Renderer — Blender Python (bpy)  v2.0
=================================================
Reads concept JSON (spec v3.1) and renders a photorealistic PNG.

Usage:
  blender --background --python blender_foam_renderer.py -- concept.json output.png
  blender --background --python blender_foam_renderer.py -- concept.json output.png --glb product.glb
  blender --background --python blender_foam_renderer.py -- concept.json output.png --engine CYCLES --samples 128
  blender --background --python blender_foam_renderer.py -- concept.json output.png --width 3840 --height 2880
"""
import bpy
import bmesh
import math
import json
import sys
import os
import traceback
from mathutils import Vector, Euler

# ─────────────────────────────────────────────────────────────────
# ARGUMENT PARSING
# ─────────────────────────────────────────────────────────────────

def parse_args():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    import argparse
    p = argparse.ArgumentParser(description='Nefab Foam Renderer — Blender')
    p.add_argument('concept_json',           help='Path to concept JSON file')
    p.add_argument('output', nargs='?',      default='foam_render.png')
    p.add_argument('--glb',                  default=None)
    p.add_argument('--width',  type=int,     default=1920)
    p.add_argument('--height', type=int,     default=1440)
    p.add_argument('--engine', default='EEVEE', choices=['EEVEE', 'CYCLES'])
    p.add_argument('--samples', type=int,    default=64)
    p.add_argument('--solver', default='FAST', choices=['FAST', 'EXACT'])
    p.add_argument('--no-glb-materials',     action='store_true')
    p.add_argument('--output-format', default='png', choices=['png', 'glb'],
                   help='Output format: png (render image) or glb (export 3-D scene)')
    return p.parse_args(argv)

# ─────────────────────────────────────────────────────────────────
# COLOUR UTILITIES
# ─────────────────────────────────────────────────────────────────

def hex_to_linear(h: str) -> tuple:
    """Convert '#RRGGBB' to Blender linear-space RGBA."""
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    def to_linear(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (to_linear(int(h[0:2], 16)),
            to_linear(int(h[2:4], 16)),
            to_linear(int(h[4:6], 16)),
            1.0)

def darken_hex(h: str, factor: float) -> str:
    h = h.lstrip('#')
    r = min(255, int(int(h[0:2], 16) * factor))
    g = min(255, int(int(h[2:4], 16) * factor))
    b = min(255, int(int(h[4:6], 16) * factor))
    return f'#{r:02X}{g:02X}{b:02X}'

# ─────────────────────────────────────────────────────────────────
# MATERIAL FACTORY  (Principled BSDF, cached)
# ─────────────────────────────────────────────────────────────────

_mat_cache: dict = {}

def get_material(name: str, hex_colour: str,
                  roughness: float = 0.85,
                  specular: float = 0.05) -> bpy.types.Material:
    if name in _mat_cache:
        return _mat_cache[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value         = hex_to_linear(hex_colour)
    bsdf.inputs['Roughness'].default_value          = roughness
    bsdf.inputs['Specular IOR Level'].default_value = specular
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (300, 0)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    _mat_cache[name] = mat
    return mat

def foam_mat(hex_col):
    return get_material(f'foam_{hex_col}', hex_col, roughness=0.90, specular=0.02)
def cavity_mat(hex_col):
    return get_material(f'cav_{hex_col}', darken_hex(hex_col, 0.22), roughness=0.96, specular=0.01)
def rebate_mat(hex_col):
    return get_material(f'reb_{hex_col}', darken_hex(hex_col, 0.75), roughness=0.92, specular=0.01)
def chamfer_mat(hex_col):
    return get_material(f'cham_{hex_col}', darken_hex(hex_col, 0.58), roughness=0.88, specular=0.02)
def product_mat(hex_col):
    return get_material(f'prod_{hex_col}', hex_col, roughness=0.45, specular=0.15)

# ─────────────────────────────────────────────────────────────────
# SCENE SETUP
# ─────────────────────────────────────────────────────────────────

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for blk in bpy.data.meshes:     bpy.data.meshes.remove(blk)
    for blk in bpy.data.materials:  bpy.data.materials.remove(blk)
    for blk in bpy.data.lights:     bpy.data.lights.remove(blk)
    _mat_cache.clear()

def setup_render(width, height, engine, samples, output_path, bg_hex):
    scene = bpy.context.scene
    if engine == 'CYCLES':
        scene.render.engine        = 'CYCLES'
        scene.cycles.samples       = samples
        scene.cycles.use_denoising = True
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'NONE'
        except Exception:
            pass
        scene.cycles.device = 'CPU'
    else:
        try:
            scene.render.engine            = 'BLENDER_EEVEE_NEXT'
            scene.eevee.taa_render_samples = 32
        except Exception:
            scene.render.engine            = 'BLENDER_EEVEE'
            scene.eevee.taa_render_samples = 32

    scene.render.resolution_x                  = width
    scene.render.resolution_y                  = height
    scene.render.resolution_percentage         = 100
    scene.render.image_settings.file_format    = 'PNG'
    scene.render.image_settings.color_depth    = '8'
    scene.render.filepath                      = output_path
    scene.render.film_transparent              = False

    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scene.world     = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value    = hex_to_linear(bg_hex)
        bg.inputs['Strength'].default_value = 1.0

# ─────────────────────────────────────────────────────────────────
# LIGHTING  — three-point, mirrors Three.js renderer angles
# ─────────────────────────────────────────────────────────────────

def setup_lighting(scene_centre: Vector, scene_size: float):
    def add_area(name, energy, size, location, rot):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy; ld.size = size
        obj = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(obj)
        obj.location = location; obj.rotation_euler = rot
    def add_point(name, energy, location):
        ld = bpy.data.lights.new(name, 'POINT')
        ld.energy = energy
        obj = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(obj)
        obj.location = location

    s, c = scene_size, scene_centre
    add_area('Key',  s * 900, s * 0.7,
             c + Vector([ s*1.2,  s*1.6,  s*0.9]),
             Euler((-math.pi/4,  math.pi/6,  math.pi/4)))
    add_area('Fill', s * 280, s * 1.3,
             c + Vector([-s*1.1,  s*0.9, -s*0.6]),
             Euler((-math.pi/5, -math.pi/6, -math.pi/4)))
    add_point('Rim', s * 150,
              c + Vector([-s*0.3, -s*0.5, -s*0.8]))

# ─────────────────────────────────────────────────────────────────
# CAMERA  — orthographic isometric
# ─────────────────────────────────────────────────────────────────

def setup_camera(scene_centre: Vector, scene_size: float):
    cam_data             = bpy.data.cameras.new('FoamCamera')
    cam_data.type        = 'ORTHO'
    cam_data.ortho_scale = scene_size * 1.05
    cam_data.clip_start  = 0.1
    cam_data.clip_end    = scene_size * 20
    cam_obj = bpy.data.objects.new('FoamCamera', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    dist = scene_size * 1.8
    cam_obj.location = scene_centre + Vector([dist, dist * 0.82, dist])
    direction        = scene_centre - cam_obj.location
    rot_quat         = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()
    return cam_obj

# ─────────────────────────────────────────────────────────────────
# PRIMITIVE HELPERS
# Blender coord system (mirrors Three.js v21):
#   X = bbox.x (width), Y = bbox.z (height, product height axis), Z = bbox.y (depth)
# ─────────────────────────────────────────────────────────────────

def add_box(name, cx, cy, cz, lx, ly, lz, material):
    mesh = bpy.data.meshes.new(name)
    obj  = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    obj.location = (cx, cy, cz)
    obj.scale    = (lx, ly, lz)
    obj.data.materials.append(material)
    return obj

def add_cylinder(name, cx, cy, cz, radius, height, material, segments=64):
    mesh = bpy.data.meshes.new(name)
    obj  = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
                           segments=segments, radius1=radius, radius2=radius,
                           depth=height)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    obj.location       = (cx, cy, cz)
    obj.rotation_euler = (math.pi / 2, 0, 0)   # axis → Y
    obj.data.materials.append(material)
    return obj

# ─────────────────────────────────────────────────────────────────
# BOOLEAN OPERATION
# ─────────────────────────────────────────────────────────────────

def apply_boolean(target, cutter, operation='DIFFERENCE', solver='FAST') -> bool:
    try:
        for obj in [target, cutter]:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        bpy.ops.object.select_all(action='DESELECT')
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        mod           = target.modifiers.new('Bool', 'BOOLEAN')
        mod.operation  = operation
        mod.object     = cutter
        mod.solver     = solver
        bpy.ops.object.modifier_apply(modifier=mod.name)
        return True
    except Exception as e:
        print(f'    Boolean warning ({target.name} - {cutter.name}): {e}')
        return False
    finally:
        try:
            if cutter.name in bpy.data.objects:
                bpy.data.objects.remove(cutter, do_unlink=True)
        except Exception:
            pass

def apply_booleans(target, cutters, solver='FAST'):
    for c in cutters:
        apply_boolean(target, c, 'DIFFERENCE', solver)

# ─────────────────────────────────────────────────────────────────
# JSON HELPERS
# ─────────────────────────────────────────────────────────────────

def get_bbox(data):
    b = data.get('product_bbox_mm', {})
    return {'x': float(b.get('x', 300)),
            'y': float(b.get('y', 300)),
            'z': float(b.get('z', 200))}

def get_foam_hex(data):
    ms = data.get('material_selection', {})
    pv = data.get('product_visual', {})
    return ms.get('foam_colour_hex') or pv.get('foam_colour_hex') or '#EDE8E0'

def get_spacing(data):
    return float(data.get('scene_composition', {}).get('threejs_explode_spacing_mm', 120))

def get_exploded(data):
    return data.get('scene_composition', {}).get('threejs_presentation', 'exploded') == 'exploded'

def dv(obj, *keys):
    for k in keys:
        if obj.get(k) is not None:
            return float(obj[k])
    return 0.0

def norm_piece(piece):
    p = dict(piece)
    if 'plank_dimensions_mm' not in p:
        bb = p.get('bounding_box_mm', {})
        th = float(p.get('foam_thickness_mm', 50))
        p['plank_dimensions_mm'] = {
            'length': float(bb.get('length', bb.get('width', 400))),
            'width':  float(bb.get('width',  bb.get('length', 400))),
            'height': th,
        }
    if 'position_from_centre_mm' not in p:
        p['position_from_centre_mm'] = {'x': 0, 'y': 0}
    return p

# ─────────────────────────────────────────────────────────────────
# PLACEMENT  (mirrors Three.js v21 getPlacement exactly)
# ─────────────────────────────────────────────────────────────────

def get_placement(piece, bbox, spacing, exploded):
    ph        = float(bbox['z'])
    dim       = piece['plank_dimensions_mm']
    H         = float(dim['height'])
    L         = float(dim['length'])
    W         = float(dim['width'])
    gap       = spacing if exploded else 0.0
    ox        = float(piece['position_from_centre_mm'].get('x', 0))
    oz        = float(piece['position_from_centre_mm'].get('y', 0))
    layer_off = float(piece.get('layer_offset_from_face_mm', 0))
    rot_y_deg = float(piece.get('rotation_y_deg', 0))
    if abs(rot_y_deg % 180) > 45:
        L, W = W, L
    face = piece.get('face', 'bottom').lower()
    if face == 'bottom':
        cy = -(gap + H / 2) - layer_off; opens_up = True
    elif face == 'top':
        cy = ph + gap + H / 2 + layer_off; opens_up = False
    else:
        cy = ph / 2; opens_up = True
    return {'cx': ox, 'cy': cy, 'cz': oz,
            'L': L, 'H': H, 'W': W,
            'opens_up': opens_up, 'rot_y_deg': rot_y_deg}

# ─────────────────────────────────────────────────────────────────
# BUILD ONE FOAM PIECE  (all cuts as real boolean ops)
# ─────────────────────────────────────────────────────────────────

def build_foam_piece(piece, foam_hex, bbox, spacing, exploded,
                      idx=0, boolean_solver='FAST'):
    piece = norm_piece(piece)
    pid   = piece.get('id', f'piece_{idx}')
    p     = get_placement(piece, bbox, spacing, exploded)
    L, H, W    = p['L'], p['H'], p['W']
    cx, cy, cz = p['cx'], p['cy'], p['cz']
    opens_up   = p['opens_up']
    cuts       = piece.get('cut_features', [])
    print(f'  {pid}  {L:.0f}×{H:.0f}×{W:.0f}mm  Y={cy:.0f}mm  {"↑" if opens_up else "↓"}')

    fm = foam_mat(foam_hex)
    cm = cavity_mat(foam_hex)
    rm = rebate_mat(foam_hex)
    ch = chamfer_mat(foam_hex)

    body    = add_box(pid, cx, cy, cz, L, H, W, fm)
    cutters = []

    for ci, cut in enumerate(cuts):
        cut_type = cut.get('type', '').lower()
        cut_id   = cut.get('cut_id', '').lower()
        if cut_id in ('corner_chamfers', 'locating_rebate', 'finger_recesses'):
            continue

        shape  = cut.get('shape', 'rectangular').lower()
        face_s = cut.get('face', '').lower()
        dim_c  = cut.get('dimensions_mm', {})
        off_x  = float(cut.get('offset_from_centre_mm', {}).get('x', 0))
        off_z  = float(cut.get('offset_from_centre_mm', {}).get('y', 0))
        cname  = f'{pid}_c{ci}'

        # Per-cut contact direction override
        cd_up = opens_up
        if 'top'    in face_s and 'bottom' not in face_s: cd_up = True
        if 'bottom' in face_s and 'top'    not in face_s: cd_up = False
        cface_y = cy + (H / 2 if cd_up else -H / 2)
        cdir    = -1 if cd_up else +1

        if cut_type in ('clearance_pocket', 'relief'):
            depth     = min(dv(dim_c, 'depth') or 20, H * 0.97)
            cutter_cy = cface_y + cdir * depth / 2
            if shape == 'circular':
                r      = dv(dim_c, 'diameter', 'width', 'length') / 2 or 50.0
                cutter = add_cylinder(cname, cx+off_x, cutter_cy, cz+off_z,
                                       r + 0.5, depth + 1.0, cm)
            elif shape == 'elliptical':
                rx     = dv(dim_c, 'length') / 2 or 60.0
                rz     = dv(dim_c, 'width')  / 2 or 40.0
                cutter = add_cylinder(cname, cx+off_x, cutter_cy, cz+off_z,
                                       rx + 0.5, depth + 1.0, cm)
                cutter.scale[2] = rz / rx
                bpy.context.view_layer.update()
            else:
                pl     = dv(dim_c, 'length', 'width') or 60.0
                pw     = dv(dim_c, 'width',  'length') or 60.0
                cutter = add_box(cname, cx+off_x, cutter_cy, cz+off_z,
                                  pl + 1.0, depth + 1.0, pw + 1.0, cm)
            cutters.append(cutter)

        elif cut_type == 'longitudinal_slot':
            s_len   = dv(dim_c, 'length') or 400.0
            s_wid   = dv(dim_c, 'width')  or 45.0
            s_dep   = min(dv(dim_c, 'depth') or H * 0.5, H * 0.6)
            dirn    = cut.get('direction', 'x_axis').lower()
            slot_cy = cface_y + cdir * s_dep / 2
            bx      = s_len + 1 if dirn == 'x_axis' else s_wid + 1
            bz      = s_wid + 1 if dirn == 'x_axis' else s_len + 1
            cutters.append(add_box(cname, cx+off_x, slot_cy, cz+off_z,
                                    bx, s_dep + 1.0, bz, cm))

        elif cut_type == 'through_slot':
            s_len = dv(dim_c, 'length', 'width') or 60.0
            s_wid = dv(dim_c, 'width',  'length') or 30.0
            cutters.append(add_box(cname, cx+off_x, cy, cz+off_z,
                                    s_len + 1, H + 2, s_wid + 1, cm))

    if cutters:
        print(f'    Applying {len(cutters)} boolean cut(s)…')
        apply_booleans(body, cutters, solver=boolean_solver)

    # ── Finger recesses ──
    finger_cut = next((c for c in cuts if c.get('cut_id', '').lower() == 'finger_recesses'), None)
    if finger_cut:
        fd  = dv(finger_cut.get('dimensions_mm', {}), 'depth')  or 25.0
        fwh = dv(finger_cut.get('dimensions_mm', {}), 'width')  or 30.0
        fl  = dv(finger_cut.get('dimensions_mm', {}), 'length') or 80.0
        for si, sz in enumerate([-1, 1]):
            rc = add_box(f'{pid}_finger_{si}',
                          cx, cy, cz + sz * (W / 2 - fd / 2 + 0.5),
                          fl + 1, fwh + 1, fd + 1, cm)
            apply_boolean(body, rc, 'DIFFERENCE', boolean_solver)

    # ── Locating rebate ──
    rebate_cut = next((c for c in cuts if c.get('cut_id', '').lower() == 'locating_rebate'), None)
    if rebate_cut:
        rd     = dv(rebate_cut.get('dimensions_mm', {}), 'depth') or 10.0
        rw     = dv(rebate_cut.get('dimensions_mm', {}), 'width') or 15.0
        bot_y  = cy - H / 2 + rd / 2
        for si, (sx, sz, sl, sw) in enumerate([
            ( L/2-rw/2,      0,      rw,      W     ),
            (-L/2+rw/2,      0,      rw,      W     ),
            ( 0,       W/2-rw/2, L-2*rw,      rw    ),
            ( 0,      -W/2+rw/2, L-2*rw,      rw    ),
        ]):
            add_box(f'{pid}_rebate_{si}', cx+sx, bot_y, cz+sz, sl, rd, sw, rm)

    # ── Corner chamfers ──
    chamfer_cut = next((c for c in cuts if c.get('cut_id', '').lower() == 'corner_chamfers'), None)
    if chamfer_cut:
        csize = dv(chamfer_cut.get('dimensions_mm', {}), 'width') or 20.0
        top_y = cy + H / 2 + 1.0
        for sx, sz in [(-1,-1),(1,-1),(1,1),(-1,1)]:
            strip = add_box(f'{pid}_cham_{sx}_{sz}',
                             cx + sx*(L/2-csize/2), top_y, cz + sz*(W/2-csize/2),
                             csize * 1.42, 1.5, csize * 0.2, ch)
            strip.rotation_euler = (0, math.atan2(float(sz), float(sx)) + math.pi/4, 0)

    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    return body

# ─────────────────────────────────────────────────────────────────
# GLB PRODUCT LOADER
# ─────────────────────────────────────────────────────────────────

GLB_ROTATIONS = {
    '+X': (0,          0,  math.pi/2),
    '-X': (0,          0, -math.pi/2),
    '+Y': (0,          0,  0),
    '-Y': (math.pi,    0,  0),
    '+Z': (-math.pi/2, 0,  0),
    '-Z': ( math.pi/2, 0,  0),
}

def add_product_glb(glb_path, bbox, glb_height_axis,
                     use_glb_materials=True, product_colour_hex='#B0B0B0'):
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    except Exception:
        pass
    print(f'  Importing GLB: {glb_path}')
    try:
        bpy.ops.import_scene.gltf(filepath=glb_path)
        imported   = list(bpy.context.selected_objects)
        if not imported:
            print('  ERROR: No objects imported from GLB'); return None

        for obj in imported:
            obj.animation_data_clear()
            if obj.data and hasattr(obj.data, 'animation_data') and obj.data.animation_data:
                obj.data.animation_data_clear()

        mesh_objs  = [o for o in imported if o.type == 'MESH']
        other_objs = [o for o in imported if o.type != 'MESH']
        for o in other_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        if not mesh_objs:
            print('  ERROR: GLB has no mesh objects'); return None

        print(f'  GLB: {len(mesh_objs)} mesh object(s)')
        bpy.ops.object.select_all(action='DESELECT')
        for o in mesh_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = mesh_objs[0]
        if len(mesh_objs) > 1:
            bpy.ops.object.join()
        product      = bpy.context.active_object
        product.name = 'product'

        rx, ry, rz = GLB_ROTATIONS.get(glb_height_axis, GLB_ROTATIONS['+Z'])
        product.rotation_euler = (rx, ry, rz)
        bpy.ops.object.select_all(action='DESELECT')
        product.select_set(True)
        bpy.context.view_layer.objects.active = product
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        product.location = (0, 0, 0)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

        # Auto-scale (metres → mm detection)
        bpy.context.view_layer.update()
        bounds    = [product.matrix_world @ Vector(c) for c in product.bound_box]
        current_h = max(v.y for v in bounds) - min(v.y for v in bounds)
        target_h  = float(bbox['z'])
        if current_h > 0:
            ratio = target_h / current_h
            if ratio > 1.1 or ratio < 0.9:
                print(f'  Scale correction ×{ratio:.4f} ({current_h:.3f} → {target_h:.1f}mm)')
                product.scale = (ratio, ratio, ratio)
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

        # Floor at Y=0, centre X/Z
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        bpy.context.view_layer.update()
        bounds = [product.matrix_world @ Vector(c) for c in product.bound_box]
        min_y  = min(v.y for v in bounds)
        ctr_x  = sum(v.x for v in bounds) / 8
        ctr_z  = sum(v.z for v in bounds) / 8
        product.location = (-ctr_x, -min_y, -ctr_z)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

        if not use_glb_materials:
            mat = product_mat(product_colour_hex)
            product.data.materials.clear()
            product.data.materials.append(mat)

        bpy.context.view_layer.objects.active = product
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass
        print(f'  Product ready: {product.name}')
        return product
    except Exception as e:
        print(f'  GLB load failed: {e}'); traceback.print_exc(); return None

def add_product_placeholder(bbox, product_hex='#B0B0B0'):
    return add_box('product', 0, bbox['z']/2, 0,
                    bbox['x'], bbox['z'], bbox['y'], product_mat(product_hex))

# ─────────────────────────────────────────────────────────────────
# SCENE EXTENTS
# ─────────────────────────────────────────────────────────────────

def compute_scene_extents():
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not mesh_objs:
        return Vector((0, 100, 0)), 600.0
    bpy.context.view_layer.update()
    corners = []
    for obj in mesh_objs:
        corners.extend([obj.matrix_world @ Vector(c) for c in obj.bound_box])
    min_v = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    max_v = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    return (min_v + max_v) / 2, max((max_v - min_v).length, 100.0)

# ─────────────────────────────────────────────────────────────────
# MAIN RENDER
# ─────────────────────────────────────────────────────────────────

def export_scene_glb(output_path: str):
    """Export the current Blender scene as a GLB file."""
    print(f'\nExporting GLB → {output_path}')
    try:
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            export_apply=True,          # apply modifiers (booleans etc.)
            export_animations=False,
            export_lights=False,
            export_cameras=False,
            export_materials='EXPORT',
            export_colors=True,
        )
        print('GLB export done.')
    except Exception as e:
        print(f'GLB export error: {e}'); traceback.print_exc()


def render_concept(data, output_path, glb_path=None,
                    width=1920, height=1440, engine='EEVEE',
                    samples=64, use_glb_materials=True, boolean_solver='FAST',
                    output_format='png'):
    bbox      = get_bbox(data)
    foam_hex  = get_foam_hex(data)
    spacing   = get_spacing(data)
    exploded  = get_exploded(data)
    sc        = data.get('scene_composition', {})
    bg_hex    = sc.get('threejs_background_hex', '#FFFFFF')
    glb_axis  = sc.get('glb_height_axis') or sc.get('glb_up_axis') or '+Z'
    prod_hex  = data.get('product_visual', {}).get('product_colour_hex', '#B0B0B0')
    pieces    = data.get('foam_pieces', [])
    prod_name = data.get('meta', {}).get('product_name', '')

    print('\n' + '═'*60)
    print('  Nefab Foam Renderer — Blender v2.0')
    print(f'  Product : {prod_name}')
    print(f'  BBox    : {bbox["x"]}×{bbox["y"]}×{bbox["z"]} mm')
    print(f'  Foam    : {foam_hex}  ({len(pieces)} pieces)')
    print(f'  Mode    : {output_format.upper()}  {engine}  {width}×{height}px')
    print('═'*60)

    clear_scene()
    setup_render(width, height, engine, samples, output_path, bg_hex)

    print('\nProduct…')
    if glb_path and os.path.isfile(glb_path):
        product = add_product_glb(glb_path, bbox, glb_axis, use_glb_materials, prod_hex)
        if not product:
            product = add_product_placeholder(bbox, prod_hex)
    else:
        print('  No GLB — using placeholder box')
        product = add_product_placeholder(bbox, prod_hex)

    print(f'\nFoam pieces ({len(pieces)})…')
    for i, piece in enumerate(pieces):
        build_foam_piece(piece, foam_hex, bbox, spacing, exploded,
                          idx=i, boolean_solver=boolean_solver)

    print('\nCamera and lighting…')
    scene_centre, scene_size = compute_scene_extents()
    setup_camera(scene_centre, scene_size)
    setup_lighting(scene_centre, scene_size)

    if output_format == 'glb':
        export_scene_glb(output_path)
    else:
        print(f'\nRendering → {output_path}')
        bpy.ops.render.render(write_still=True)
    print('Done.')


if __name__ == '__main__':
    args = parse_args()
    with open(args.concept_json) as f:
        data = json.load(f)
    render_concept(
        data              = data,
        output_path       = args.output,
        glb_path          = args.glb,
        width             = args.width,
        height            = args.height,
        engine            = args.engine,
        samples           = args.samples,
        use_glb_materials = not args.no_glb_materials,
        boolean_solver    = args.solver,
        output_format     = args.output_format,
    )

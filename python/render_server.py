"""
Nefab Foam Render Server — Blender backend
Flask micro-service that runs Blender headless to render concept JSON → PNG.

Start locally:
  BLENDER_BIN=/path/to/blender python render_server.py

Environment variables:
  BLENDER_BIN    — path to blender binary (default: 'blender')
  PORT           — listen port (default: 5001)
  RENDER_SECRET  — optional bearer token for auth (leave unset for local dev)
  RENDER_ENGINE  — default engine: EEVEE or CYCLES (default: EEVEE)
  RENDER_SAMPLES — default Cycles sample count (default: 64)

POST /render
  Body: concept JSON object
  Query params:
    glb_url    — optional signed URL to download product GLB
    width      — image width px (default 1920)
    height     — image height px (default 1440)
    engine     — EEVEE or CYCLES
    samples    — Cycles samples
    solver     — FAST or EXACT (boolean solver)
  Response: image/png

GET /health
  Response: {"status": "ok", "blender": "<version>"}
"""
import io
import os
import sys
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

BLENDER_BIN    = os.environ.get('BLENDER_BIN', 'blender')
RENDER_SECRET  = os.environ.get('RENDER_SECRET', '')
RENDER_ENGINE  = os.environ.get('RENDER_ENGINE', 'EEVEE')
RENDER_SAMPLES = int(os.environ.get('RENDER_SAMPLES', '64'))
SCRIPT_PATH    = str(Path(__file__).parent / 'blender_foam_renderer.py')


def _check_auth():
    if not RENDER_SECRET:
        return True
    return request.headers.get('Authorization', '') == f'Bearer {RENDER_SECRET}'


def _blender_version() -> str:
    try:
        r = subprocess.run([BLENDER_BIN, '--version'],
                           capture_output=True, text=True, timeout=10)
        return r.stdout.split('\n')[0].strip()
    except Exception as e:
        return f'error: {e}'


def _download_glb(url: str) -> str | None:
    try:
        fd, path = tempfile.mkstemp(suffix='.glb')
        os.close(fd)
        urllib.request.urlretrieve(url, path)
        return path
    except Exception as e:
        print(f'[render_server] GLB download failed: {e}')
        return None


def _run_blender(json_path: str, out_path: str, glb_path: str | None,
                  width: int, height: int, engine: str,
                  samples: int, solver: str,
                  output_format: str = 'png') -> subprocess.CompletedProcess:
    cmd = [
        BLENDER_BIN,
        '--background',
        '--python', SCRIPT_PATH,
        '--',
        json_path,
        out_path,
        '--width',         str(width),
        '--height',        str(height),
        '--engine',        engine,
        '--samples',       str(samples),
        '--solver',        solver,
        '--output-format', output_format,
    ]
    if glb_path:
        cmd += ['--glb', glb_path]
    print(f'[render_server] Running ({output_format}): {" ".join(cmd[:6])} …')
    return subprocess.run(cmd, capture_output=True, text=True, timeout=600)


@app.get('/health')
def health():
    return jsonify({'status': 'ok', 'blender': _blender_version()})


@app.post('/render')
def render():
    if not _check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({'error': 'Invalid JSON body'}), 400
    if not data:
        return jsonify({'error': 'Empty body'}), 400

    width         = int(request.args.get('width',   1920))
    height        = int(request.args.get('height',  1440))
    engine        = request.args.get('engine',  RENDER_ENGINE).upper()
    samples       = int(request.args.get('samples', RENDER_SAMPLES))
    solver        = request.args.get('solver',  'FAST').upper()
    glb_url       = request.args.get('glb_url')
    output_format = request.args.get('format', 'png').lower()   # 'png' or 'glb'

    if output_format not in ('png', 'glb'):
        return jsonify({'error': 'format must be png or glb'}), 400

    tmp_glb = None
    if glb_url:
        tmp_glb = _download_glb(glb_url)

    out_suffix = '.glb' if output_format == 'glb' else '.png'
    fd_json, json_path = tempfile.mkstemp(suffix='.json')
    fd_out,  out_path  = tempfile.mkstemp(suffix=out_suffix)
    os.close(fd_json)
    os.close(fd_out)

    try:
        with open(json_path, 'w') as f:
            json.dump(data, f)

        result = _run_blender(json_path, out_path, tmp_glb,
                               width, height, engine, samples, solver,
                               output_format=output_format)

        if result.returncode != 0:
            err = (result.stderr or result.stdout or '')[-2000:]
            print(f'[render_server] Blender error:\n{err}')
            return jsonify({'error': f'Blender exited {result.returncode}',
                            'detail': err}), 500

        if not Path(out_path).exists() or Path(out_path).stat().st_size == 0:
            return jsonify({'error': 'Blender produced no output file'}), 500

        with open(out_path, 'rb') as f:
            out_bytes = f.read()

        mimetype = 'model/gltf-binary' if output_format == 'glb' else 'image/png'
        return send_file(io.BytesIO(out_bytes), mimetype=mimetype)

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Render timed out (600s)'}), 504
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        for p in [json_path, out_path]:
            try: os.unlink(p)
            except Exception: pass
        if tmp_glb:
            try: os.unlink(tmp_glb)
            except Exception: pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7860))
    print(f'[render_server] Starting on http://localhost:{port}')
    print(f'[render_server] Blender: {_blender_version()}')
    if RENDER_SECRET:
        print('[render_server] Auth enabled')
    app.run(host='0.0.0.0', port=port, debug=False)

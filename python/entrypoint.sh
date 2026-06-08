#!/bin/bash
# Blender headless render server entrypoint
# Forces Mesa software rasterization (no GPU required — works on HF Spaces free tier)
export PORT=${PORT:-7860}

# ── Mesa software rendering (no GPU needed) ──────────────────────────────────
# Forces Mesa to use the software (LLVMpipe / softpipe) OpenGL/EGL driver
# instead of trying to open a real GPU device that doesn't exist.
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvm          # use LLVMpipe (faster SW rasterizer)
export MESA_GL_VERSION_OVERRIDE=4.5 # report OpenGL 4.5 so Blender accepts it
export MESA_GLSL_VERSION_OVERRIDE=450
export EGL_PLATFORM=surfaceless     # EGL without a real display

# ── Xvfb virtual display (needed for EEVEE + some Blender UI init) ───────────
echo "[entrypoint] Starting Xvfb on :99…"
Xvfb :99 -screen 0 1920x1080x24 +extension GLX -ac &
XVFB_PID=$!
sleep 2

if kill -0 $XVFB_PID 2>/dev/null; then
  echo "[entrypoint] Xvfb running (PID $XVFB_PID)"
else
  echo "[entrypoint] WARNING: Xvfb did not start"
fi

export DISPLAY=:99

echo "[entrypoint] Starting render server on port $PORT…"
exec python3 render_server.py

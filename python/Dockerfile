# ── Nefab Foam Render Server — Blender headless ──────────────────
# Ubuntu 22.04 + Blender 4.1 + Xvfb (for EEVEE) + CPU Cycles
# ─────────────────────────────────────────────────────────────────
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV BLENDER_VERSION=4.1.0
ENV BLENDER_DIR=/opt/blender
ENV BLENDER_BIN=${BLENDER_DIR}/blender

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    wget xz-utils \
    # OpenGL / EGL / EEVEE headless (all needed even for CPU/CYCLES)
    xvfb \
    libgl1-mesa-glx libgl1-mesa-dri libgl1-mesa-dev \
    libgles2-mesa libglu1-mesa \
    libegl1 libegl-mesa0 libegl1-mesa-dev \
    libxrender1 libsm6 libxext6 libx11-6 \
    libxcursor1 libxt6 libxi6 libxfixes3 libxrandr2 \
    libxkbcommon0 libxkbcommon-x11-0 \
    # Blender deps
    libglib2.0-0 libdbus-1-3 libopenal1 \
    # Mesa software rasterizer (GPU-less rendering)
    mesa-utils libglx-mesa0 \
    && rm -rf /var/lib/apt/lists/*

# Download and install Blender 4.1
RUN wget -q "https://download.blender.org/release/Blender4.1/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
    && tar -xf "blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
    && mv "blender-${BLENDER_VERSION}-linux-x64" ${BLENDER_DIR} \
    && rm "blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
    && ln -s ${BLENDER_BIN} /usr/local/bin/blender

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY blender_foam_renderer.py render_server.py ./

# Default: EEVEE (needs Xvfb — entrypoint starts it)
# For Cycles (no display): set RENDER_ENGINE=CYCLES
ENV RENDER_ENGINE=CYCLES
ENV BLENDER_BIN=${BLENDER_BIN}
ENV DISPLAY=:99

# Entrypoint starts Xvfb then the Flask server
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# HF Spaces requires port 7860
EXPOSE 7860

CMD ["./entrypoint.sh"]

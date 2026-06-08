---
title: Foam Render Server
emoji: 🧊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Nefab Foam Render Server

Blender 4.1 headless render server for the Nefab foam concept renderer.

**POST** `/render` — accepts concept JSON, returns PNG  
**GET** `/health` — returns `{"status": "ok", "blender": "..."}`

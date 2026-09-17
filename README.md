# ⚡ LiveChat Ultra

> A super-fast, real-time communication web application powered by **Python WebSockets**, **WebRTC video/voice calls**, and **live typing progress indicators**, wrapped in a modern glassmorphic cyberpunk UI.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## ✨ Features

- 🚀 **Python WebSocket Engine**: High-throughput, asynchronous real-time backend powered by **FastAPI** and **Uvicorn**.
- ✍️ **Live Typing Progress**: 
  - Dynamic animated typing waveform indicators.
  - Keystroke velocity & character progress bar.
  - **⚡ Live Keystroke Stream (Ghost Mode)**: Peers can see characters being composed in real time with an animated cursor.
- 📹 **WebRTC Peer-to-Peer Calls**:
  - Full HD Video and crystal-clear Voice calling.
  - Interactive screen sharing.
  - Floating, draggable video tiles with local Picture-in-Picture.
  - Automated STUN-based NAT traversal and WebSocket signaling.
- 🎨 **Obsidian Glassmorphism Aesthetic**:
  - Dark mode luxury palette (`#060911`, neon cyan `#00f2fe`, violet `#7928ca`).
  - Google Fonts (Outfit, Plus Jakarta Sans, JetBrains Mono).
  - 60fps micro-animations and responsive mobile-first drawer navigation.
- 🔊 **Zero-Latency Sound Synthesizer**:
  - Custom Web Audio API synthesizer generates instant futuristic chime sounds for message send, receive, join, and call rings with 0 network asset lag.
- 📎 **File & Media Transfer**: Instant drag-and-drop or clipboard attachment for images and documents.
- 🌐 **Room-Based Architecture**: Instant URL-based room sharing (`/?room=your-room-id`).

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+ / FastAPI / Uvicorn / WebSockets / Pydantic
- **Frontend**: Vanilla ES6+ JavaScript, CSS3 Glassmorphism Design System, HTML5
- **Real-Time Protocols**: WebSockets (RFC 6455), WebRTC (`RTCPeerConnection`, STUN)
- **Deployment**: Ready for [Render](https://render.com) (includes `render.yaml`, `Procfile`, and dynamic port binding)

---

## 🚀 Quick Start (Local Run)

### 1. Clone the repository
```bash
git clone https://github.com/jisan789/livechat.git
cd livechat
```

### 2. Create and activate a virtual environment
```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Start the server
```bash
python main.py
```
Or with Uvicorn directly:
```bash
uvicorn main:app --reload --port 8000
```

Open **`http://localhost:8000`** in your browser. Open multiple windows or devices to test real-time live typing progress, instant chat, and WebRTC video calls!

---

## ☁️ Deploying to Render (Step-by-Step)

### Option 1: Automatic Blueprint (Recommended)
1. Push this repository to your GitHub account (`https://github.com/jisan789/livechat.git`).
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Connect the `livechat` repository.
5. Render will automatically read `render.yaml` and configure your Web Service!

### Option 2: Manual Web Service Setup
1. On the Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository `jisan789/livechat`.
3. Configure the following fields:
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
4. Click **Create Web Service**. Your app will be live on a secure `https://<your-app>.onrender.com` domain with full `wss://` WebSocket and WebRTC support!

---

## 🔒 Security & Architecture Notes

- WebRTC peer connections automatically use public STUN servers for NAT traversal.
- WebSockets use standard automatic upgrade headers; on Render, SSL is terminated at the edge (`wss://` to internal `ws://`).
- Health checks are routed through `/health` to allow zero-downtime rolling deploys.

---

## 📄 License
MIT License. Built for lightning-fast real-time communication.

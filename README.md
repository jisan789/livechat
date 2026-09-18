# LiveChat — Private 2-User Real-Time Chat

A private real-time chat application for **Jisu** and **Jenu**.

## Features
- 🔐 PIN-protected login (Jisu: `1470`, Jenu: `3690`)
- 💬 Real-time messaging via WebSocket
- ⌨️ Live typing indicators with keypress sounds
- 📷 Image sharing
- 🎤 Voice note recording
- 🔇 Sound mute/unmute toggle

## Local Development

```bash
pip install -r requirements.txt
python server.py
```

Open `http://localhost:8000` in two browser tabs.
- Tab 1: Enter PIN `1470` (Jisu)
- Tab 2: Enter PIN `3690` (Jenu)

## Deploy on Render

1. Push this repo to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — click **Deploy**

## Tech Stack
- **Backend**: Python + FastAPI + WebSockets
- **Frontend**: Vanilla HTML/CSS/JS
- **Deploy**: Render (free tier)

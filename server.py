"""
LiveChat WebSocket + WebRTC Signaling Server
FastAPI backend for real-time 2-user chat and audio calls.
Deploy on Render — reads PORT env variable automatically.
"""

import os
import json
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("livechat")

app = FastAPI(title="LiveChat Server", version="1.0.0")

# ─────────────────────────────────────────────────────────────
#  Connection Registry
# ─────────────────────────────────────────────────────────────
VALID_USERS = {"jisu", "jenu"}
OPPONENTS: dict[str, str] = {"jisu": "jenu", "jenu": "jisu"}

# {user_key: WebSocket}
connections: dict[str, WebSocket] = {}


async def safe_send(ws: WebSocket, payload: dict) -> bool:
    """Send JSON safely, returns False if the connection is broken."""
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


async def notify_opponent(user_key: str, payload: dict):
    """Forward a payload to the opponent if they are connected."""
    opponent = OPPONENTS.get(user_key)
    if opponent and opponent in connections:
        ok = await safe_send(connections[opponent], payload)
        if not ok:
            connections.pop(opponent, None)


# ─────────────────────────────────────────────────────────────
#  WebSocket Endpoint
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/{user_key}")
async def websocket_endpoint(websocket: WebSocket, user_key: str):
    if user_key not in VALID_USERS:
        await websocket.close(code=4001, reason="Unknown user")
        return

    await websocket.accept()

    # If user already has an active connection (e.g. page refresh),
    # close the old one gracefully before replacing
    old_ws = connections.get(user_key)
    if old_ws is not None:
        try:
            await old_ws.close(code=1000, reason="Replaced by new connection")
        except Exception:
            pass

    connections[user_key] = websocket
    logger.info(f"[+] {user_key} connected  (total: {len(connections)})")

    opponent = OPPONENTS[user_key]

    # Tell opponent this user is now online
    await notify_opponent(user_key, {"type": "presence", "status": "online", "user": user_key})

    # Tell this user whether opponent is already online
    await safe_send(websocket, {
        "type": "presence",
        "status": "online" if opponent in connections else "offline",
        "user": opponent
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            # All message types are just relayed to the opponent
            data["from"] = user_key
            await notify_opponent(user_key, data)

            logger.debug(f"  {user_key} → {opponent}: {msg_type}")

    except WebSocketDisconnect:
        # CRITICAL: Only remove from dict if THIS websocket is still the current one.
        # If a new connection already replaced us, don't touch it.
        if connections.get(user_key) is websocket:
            connections.pop(user_key, None)
            logger.info(f"[-] {user_key} disconnected (total: {len(connections)})")
            await notify_opponent(user_key, {"type": "presence", "status": "offline", "user": user_key})
        else:
            logger.info(f"[-] {user_key} stale connection closed (replaced by newer)")



# ─────────────────────────────────────────────────────────────
#  Health Check
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "connected": list(connections.keys())})


# ─────────────────────────────────────────────────────────────
#  Static Files + SPA Catch-all
# ─────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def serve_root():
    return FileResponse("index.html")


# ─────────────────────────────────────────────────────────────
#  Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

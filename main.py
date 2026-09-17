import os
import json
import time
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="LiveChat Ultra", description="Super-fast Live Chatting App with WebSockets, WebRTC & Live Typing Progress")

# CORS middleware for open accessibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        # Structure: { room_id: { client_id: { "ws": WebSocket, "username": str, "avatar": str, "joined_at": float } } }
        self.rooms: Dict[str, Dict[str, Dict[str, Any]]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, client_id: str, username: str, avatar: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
        
        self.rooms[room_id][client_id] = {
            "ws": websocket,
            "username": username,
            "avatar": avatar,
            "joined_at": time.time()
        }

        # Broadcast user list update to all members of the room
        await self.broadcast_room_presence(room_id, event_type="join", user_data={
            "client_id": client_id,
            "username": username,
            "avatar": avatar
        })

    def disconnect(self, room_id: str, client_id: str) -> Dict[str, Any]:
        user_data = None
        if room_id in self.rooms and client_id in self.rooms[room_id]:
            user_data = self.rooms[room_id].pop(client_id)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
        return user_data

    def get_room_members(self, room_id: str) -> List[Dict[str, Any]]:
        if room_id not in self.rooms:
            return []
        return [
            {
                "client_id": cid,
                "username": meta["username"],
                "avatar": meta["avatar"],
                "joined_at": meta["joined_at"]
            }
            for cid, meta in self.rooms[room_id].items()
        ]

    async def send_personal_message(self, message: dict, room_id: str, target_client_id: str):
        if room_id in self.rooms and target_client_id in self.rooms[room_id]:
            ws = self.rooms[room_id][target_client_id]["ws"]
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                pass

    async def broadcast_to_room(self, message: dict, room_id: str, exclude_client_id: str = None):
        if room_id not in self.rooms:
            return
        
        dead_clients = []
        payload = json.dumps(message)
        for client_id, client_meta in self.rooms[room_id].items():
            if exclude_client_id and client_id == exclude_client_id:
                continue
            try:
                await client_meta["ws"].send_text(payload)
            except Exception:
                dead_clients.append(client_id)

        for client_id in dead_clients:
            self.disconnect(room_id, client_id)

    async def broadcast_room_presence(self, room_id: str, event_type: str, user_data: dict = None):
        members = self.get_room_members(room_id)
        msg = {
            "type": "presence",
            "event": event_type,
            "user": user_data,
            "members": members,
            "member_count": len(members),
            "timestamp": time.time()
        }
        await self.broadcast_to_room(msg, room_id)

manager = ConnectionManager()

# Static files & Index
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def get_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse({"message": "LiveChat Backend is running. Frontend index.html not yet created."})

@app.get("/health")
async def health_check():
    total_users = sum(len(room) for room in manager.rooms.values())
    return {
        "status": "healthy",
        "service": "livechat",
        "active_rooms": len(manager.rooms),
        "total_connected_users": total_users,
        "timestamp": time.time()
    }

@app.get("/api/rooms/{room_id}/info")
async def room_info(room_id: str):
    members = manager.get_room_members(room_id)
    return {
        "room_id": room_id,
        "active_count": len(members),
        "members": members
    }

@app.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    username = websocket.query_params.get("username", f"User-{client_id[:4]}")
    avatar = websocket.query_params.get("avatar", "⚡")

    await manager.connect(websocket, room_id, client_id, username, avatar)

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            if msg_type == "chat":
                # Real-time chat message broadcast
                message_payload = {
                    "type": "chat",
                    "id": data.get("id", f"msg-{int(time.time()*1000)}"),
                    "sender_id": client_id,
                    "sender_name": username,
                    "sender_avatar": avatar,
                    "text": data.get("text", ""),
                    "file": data.get("file", None), # base64 or file data
                    "reply_to": data.get("reply_to", None),
                    "timestamp": time.time()
                }
                await manager.broadcast_to_room(message_payload, room_id)

            elif msg_type == "typing_progress":
                # Super fast live typing progress & ghost preview
                typing_payload = {
                    "type": "typing_progress",
                    "sender_id": client_id,
                    "sender_name": username,
                    "is_typing": data.get("is_typing", False),
                    "progress": data.get("progress", 0), # 0-100% or character count
                    "char_count": data.get("char_count", 0),
                    "ghost_text": data.get("ghost_text", None), # optional live streaming preview
                    "timestamp": time.time()
                }
                # Broadcast typing progress to all peers except sender
                await manager.broadcast_to_room(typing_payload, room_id, exclude_client_id=client_id)

            elif msg_type == "reaction":
                # Reaction to a specific message
                reaction_payload = {
                    "type": "reaction",
                    "message_id": data.get("message_id"),
                    "emoji": data.get("emoji"),
                    "sender_id": client_id,
                    "sender_name": username
                }
                await manager.broadcast_to_room(reaction_payload, room_id)

            elif msg_type == "webrtc_signal":
                # WebRTC peer-to-peer signaling: offer, answer, ice_candidate, call_start, call_end
                target_id = data.get("target_id")
                signal_data = data.get("signal")
                sub_type = data.get("sub_type", "signal")

                signal_payload = {
                    "type": "webrtc_signal",
                    "sub_type": sub_type,
                    "sender_id": client_id,
                    "sender_name": username,
                    "sender_avatar": avatar,
                    "target_id": target_id,
                    "signal": signal_data,
                    "timestamp": time.time()
                }

                if target_id:
                    # Direct targeted peer message
                    await manager.send_personal_message(signal_payload, room_id, target_id)
                else:
                    # Broadcast to entire room (e.g. room call invite or peer discovery)
                    await manager.broadcast_to_room(signal_payload, room_id, exclude_client_id=client_id)

            elif msg_type == "ping":
                # Ultra fast heartbeat response
                await websocket.send_text(json.dumps({"type": "pong", "timestamp": time.time()}))

    except WebSocketDisconnect:
        user_meta = manager.disconnect(room_id, client_id)
        if user_meta:
            await manager.broadcast_room_presence(room_id, event_type="leave", user_data={
                "client_id": client_id,
                "username": user_meta["username"],
                "avatar": user_meta["avatar"]
            })
    except Exception as e:
        manager.disconnect(room_id, client_id)
        await manager.broadcast_room_presence(room_id, event_type="leave", user_data={"client_id": client_id})

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀 Starting LiveChat Ultra server on http://0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

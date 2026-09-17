"""
Database module for LiveChat
Supports:
1. External PHP JSON Receiver (via PHP_STORAGE_URL environment variable)
2. Local SQLite fallback (livechat.db)
"""

import sqlite3
import os
import json
import urllib.request
import urllib.parse
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("livechat.db")

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "livechat.db")
PHP_STORAGE_URL = os.environ.get("PHP_STORAGE_URL", "http://cdn.jisanfx.top/chatdatabase/reciever.php").strip()


def get_sqlite_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables and indexes (for SQLite)."""
    if PHP_STORAGE_URL:
        logger.info(f"[DB] Using external PHP JSON storage at {PHP_STORAGE_URL}")
        return

    with get_sqlite_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                recipient TEXT NOT NULL,
                msg_type TEXT NOT NULL,
                text_content TEXT,
                media_duration REAL,
                client_time TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_pair 
            ON messages(sender, recipient);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_created 
            ON messages(created_at);
        """)
        conn.commit()
    logger.info("[DB] SQLite database initialized.")


def save_message(
    sender: str,
    recipient: str,
    msg_type: str,
    text_content: Optional[str] = None,
    media_duration: Optional[float] = None,
    client_time: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a message to PHP endpoint or SQLite."""
    payload = {
        "sender": sender,
        "recipient": recipient,
        "msg_type": msg_type,
        "text_content": text_content,
        "media_duration": media_duration,
        "client_time": client_time,
    }

    # If PHP_STORAGE_URL is configured, send HTTP POST to PHP receiver
    if PHP_STORAGE_URL:
        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                PHP_STORAGE_URL,
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "LiveChat-Server/1.0"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if result.get("status") == "ok" and "data" in result:
                    return result["data"]
        except Exception as e:
            logger.error(f"[DB] Failed to save to PHP storage ({e}). Falling back to SQLite.")

    # SQLite fallback
    with get_sqlite_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO messages (sender, recipient, msg_type, text_content, media_duration, client_time)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (sender, recipient, msg_type, text_content, media_duration, client_time),
        )
        msg_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        row = cursor.fetchone()
        return dict(row) if row else {
            "id": msg_id,
            "sender": sender,
            "recipient": recipient,
            "msg_type": msg_type,
            "text_content": text_content,
            "media_duration": media_duration,
            "client_time": client_time,
        }


def get_conversation(user1: str, user2: str, limit: int = 200) -> List[Dict[str, Any]]:
    """Fetch messages exchanged between user1 and user2."""
    if PHP_STORAGE_URL:
        try:
            params = urllib.parse.urlencode({
                "action": "get",
                "user1": user1,
                "user2": user2
            })
            url = f"{PHP_STORAGE_URL}?{params}"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "LiveChat-Server/1.0"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if result.get("status") == "ok" and "messages" in result:
                    return result["messages"]
        except Exception as e:
            logger.error(f"[DB] Failed to get messages from PHP storage ({e}). Falling back to SQLite.")

    # SQLite fallback
    with get_sqlite_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM (
                SELECT * FROM messages
                WHERE (sender = ? AND recipient = ?)
                   OR (sender = ? AND recipient = ?)
                ORDER BY id DESC
                LIMIT ?
            ) ORDER BY id ASC;
            """,
            (user1, user2, user2, user1, limit),
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def clear_messages() -> bool:
    """Clear all messages from PHP storage and local SQLite."""
    success = False
    if PHP_STORAGE_URL:
        try:
            sep = "&" if "?" in PHP_STORAGE_URL else "?"
            url = f"{PHP_STORAGE_URL}{sep}action=clear"
            req = urllib.request.Request(url, headers={"User-Agent": "LiveChat-Server/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if result.get("status") == "ok":
                    success = True
                    logger.info("[DB] Cleared PHP storage messages.json.")
        except Exception as e:
            logger.error(f"[DB] Error clearing PHP storage ({e})")

    try:
        with get_sqlite_connection() as conn:
            conn.execute("DELETE FROM messages;")
            conn.commit()
        success = True
        logger.info("[DB] Cleared SQLite messages.")
    except Exception as e:
        logger.error(f"[DB] Error clearing SQLite messages: {e}")

    return success

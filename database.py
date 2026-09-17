"""
Database module for LiveChat
Uses SQLite to store persistent messages across page refreshes and offline sessions.
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "livechat.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables and indexes."""
    with get_connection() as conn:
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


def save_message(
    sender: str,
    recipient: str,
    msg_type: str,
    text_content: Optional[str] = None,
    media_duration: Optional[float] = None,
    client_time: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a message to the database and return the saved dictionary."""
    with get_connection() as conn:
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
    """
    Fetch all chat & voice messages exchanged between user1 and user2,
    ordered chronologically by id/created_at.
    """
    with get_connection() as conn:
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

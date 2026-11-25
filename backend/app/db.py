from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection(db_path: str) -> sqlite3.Connection:
    if db_path != ":memory:":
        parent = os.path.dirname(os.path.abspath(db_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> None:
    conn = get_connection(db_path)
    try:
        if db_path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_messages_session_id
            ON messages (session_id, id);
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                system_prompt TEXT,
                updated_at TEXT NOT NULL
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def check_db_health(db_path: str) -> bool:
    conn = get_connection(db_path)
    try:
        conn.execute("SELECT 1;").fetchone()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get_session_messages(db_path: str, session_id: str) -> list[dict[str, Any]]:
    conn = get_connection(db_path)
    try:
        rows = conn.execute(
            """
            SELECT role, content, metadata
            FROM messages
            WHERE session_id = ?
            ORDER BY id ASC;
            """,
            (session_id,),
        ).fetchall()
        result: list[dict[str, Any]] = []
        for row in rows:
            item: dict[str, Any] = {
                "role": row["role"],
                "content": row["content"],
            }
            if row["role"] == "assistant" and row["metadata"]:
                item["metadata"] = json.loads(row["metadata"])
            result.append(item)
        return result
    finally:
        conn.close()


def get_session_system_prompt(db_path: str, session_id: str) -> Optional[str]:
    conn = get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT system_prompt FROM sessions WHERE session_id = ?;",
            (session_id,),
        ).fetchone()
        if row is None:
            return None
        return row["system_prompt"]
    finally:
        conn.close()


def save_turn(
    db_path: str,
    session_id: str,
    user_content: str,
    assistant_content: str,
    metadata: dict[str, Any],
    system_prompt_override: Optional[str] = None,
) -> None:
    now = _utc_now_iso()
    metadata_json = json.dumps(metadata)
    conn = get_connection(db_path)
    try:
        with conn:
            if system_prompt_override is not None:
                conn.execute(
                    """
                    INSERT INTO sessions (session_id, system_prompt, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        system_prompt = excluded.system_prompt,
                        updated_at = excluded.updated_at;
                    """,
                    (session_id, system_prompt_override, now),
                )
            conn.execute(
                """
                INSERT INTO messages (session_id, role, content, metadata, created_at)
                VALUES (?, 'user', ?, NULL, ?);
                """,
                (session_id, user_content, now),
            )
            conn.execute(
                """
                INSERT INTO messages (session_id, role, content, metadata, created_at)
                VALUES (?, 'assistant', ?, ?, ?);
                """,
                (session_id, assistant_content, metadata_json, now),
            )
    finally:
        conn.close()

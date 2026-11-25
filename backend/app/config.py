from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class KeyEntry:
    key_id: str
    api_key: str


class Settings:
    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        raw_keys = os.getenv("LLM_API_KEYS", "")
        keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
        self.key_pool: list[KeyEntry] = [
            KeyEntry(key_id=f"key_{idx + 1}", api_key=key)
            for idx, key in enumerate(keys)
        ]

        self.llm_model: str = os.getenv("LLM_MODEL", "gemini/gemini-3.5-flash-lite").strip()
        self.database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/app.db").strip()

        raw_origins = os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        )
        self.allowed_origins: list[str] = [
            o.strip() for o in raw_origins.split(",") if o.strip()
        ]

        self.enable_failure_simulation: bool = (
            os.getenv("ENABLE_FAILURE_SIMULATION", "false").strip().lower() == "true"
        )
        self.default_system_prompt: str = os.getenv(
            "DEFAULT_SYSTEM_PROMPT",
            "You are a helpful, concise AI assistant.",
        ).strip()
        self.cache_type: str = os.getenv("CACHE_TYPE", "local").strip().lower()
        self.cache_dir: str = os.getenv("CACHE_DIR", "/tmp/litellm_cache").strip()

    @property
    def sqlite_path(self) -> str:
        url = self.database_url
        if url == ":memory:" or url == "sqlite:///:memory:":
            return ":memory:"
        if url.startswith("sqlite:////"):
            # Four slashes: absolute path, e.g. sqlite:////data/app.db -> /data/app.db
            return "/" + url[len("sqlite:////"):]
        if url.startswith("sqlite:///"):
            # Three slashes: relative path, e.g. sqlite:///./app.db -> ./app.db
            return url[len("sqlite:///"):]
        return url


settings = Settings()

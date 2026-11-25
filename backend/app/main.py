from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import (
    check_db_health,
    get_session_messages,
    get_session_system_prompt,
    init_db,
    save_turn,
)
from app.gateway import (
    AllProvidersUnavailableError,
    complete_with_failover,
    init_cache,
)
from app.schemas import (
    ChatMetadata,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    HistoryMessage,
    SessionMessagesResponse,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("lyftr.api")

_cache_enabled: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cache_enabled
    init_db(settings.sqlite_path)
    _cache_enabled = init_cache(settings)
    logger.info(
        "Started backend: keys=%d cache=%s db=%s failure_sim=%s",
        len(settings.key_pool),
        _cache_enabled,
        settings.sqlite_path,
        settings.enable_failure_simulation,
    )
    yield


app = FastAPI(
    title="Lyftr AI LLM Gateway",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error during request: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    db_ok = check_db_health(settings.sqlite_path)
    keys_count = len(settings.key_pool)
    if not db_ok or keys_count == 0:
        raise HTTPException(
            status_code=503,
            detail="service not ready",
        )
    return HealthResponse(
        status="ok",
        keys_configured=keys_count,
        cache_enabled=_cache_enabled,
    )


@app.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    x_simulate_failure: Optional[str] = Header(default=None, alias="X-Simulate-Failure"),
) -> ChatResponse:
    db_path = settings.sqlite_path

    # Load prior conversation history for this session
    history = get_session_messages(db_path, payload.session_id)

    # Resolve system prompt: explicit request override > stored session override > default
    if payload.system_prompt is not None:
        effective_system_prompt = payload.system_prompt
    else:
        stored_prompt = get_session_system_prompt(db_path, payload.session_id)
        effective_system_prompt = (
            stored_prompt if stored_prompt is not None else settings.default_system_prompt
        )

    llm_messages: list[dict[str, str]] = []
    if effective_system_prompt:
        llm_messages.append({"role": "system", "content": effective_system_prompt})

    for msg in history:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})

    llm_messages.append({"role": "user", "content": payload.message})

    try:
        result = complete_with_failover(
            settings=settings,
            messages=llm_messages,
            simulate_failure_header=x_simulate_failure,
        )
    except AllProvidersUnavailableError:
        raise HTTPException(status_code=503, detail="all providers unavailable")

    metadata = ChatMetadata(
        resolution_source=result.resolution_source,  # type: ignore[arg-type]
        model=result.model,
        latency_ms=result.latency_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        key_id=result.key_id,
        fallback_attempts=result.fallback_attempts,
    )

    save_turn(
        db_path=db_path,
        session_id=payload.session_id,
        user_content=payload.message,
        assistant_content=result.reply,
        metadata=metadata.model_dump(),
        system_prompt_override=payload.system_prompt,
    )

    return ChatResponse(
        session_id=payload.session_id,
        reply=result.reply,
        metadata=metadata,
    )


@app.get("/sessions/{session_id}/messages", response_model=SessionMessagesResponse)
async def get_messages(session_id: str) -> SessionMessagesResponse:
    messages = get_session_messages(settings.sqlite_path, session_id)
    if not messages:
        raise HTTPException(status_code=404, detail="session not found")
    return SessionMessagesResponse(
        session_id=session_id,
        messages=[HistoryMessage(**m) for m in messages],
    )

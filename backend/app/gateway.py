from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import litellm

from app.config import KeyEntry, Settings

logger = logging.getLogger("lyftr.gateway")

VALID_SIMULATED_STATUSES = {429, 500, 502, 503}


class AllProvidersUnavailableError(Exception):
    """Raised when every configured API key fails."""


class SimulatedProviderError(Exception):
    """Raised when X-Simulate-Failure triggers a simulated HTTP error."""

    def __init__(self, key_id: str, status_code: int) -> None:
        self.key_id = key_id
        self.status_code = status_code
        super().__init__(f"Simulated {status_code} failure for {key_id}")


@dataclass
class GatewayResult:
    reply: str
    resolution_source: str
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    key_id: Optional[str]
    fallback_attempts: int


def init_cache(settings: Settings) -> bool:
    """Initialize LiteLLM's built-in cache (local in-memory or disk)."""
    try:
        if settings.cache_type == "disk":
            litellm.cache = litellm.Cache(
                type="disk",
                disk_cache_dir=settings.cache_dir,
            )
        else:
            litellm.cache = litellm.Cache(type="local")
        litellm.enable_cache()
        return True
    except Exception as exc:
        logger.warning("Failed to initialize LiteLLM cache: %s", exc)
        litellm.cache = None
        return False


def parse_simulate_failure_header(header_value: Optional[str]) -> dict[str, int]:
    """Parse X-Simulate-Failure header into a mapping of key_id (or '*') -> status code."""
    if not header_value:
        return {}
    failures: dict[str, int] = {}
    for part in header_value.split(","):
        item = part.strip()
        if not item or "=" not in item:
            continue
        key_id, raw_status = item.split("=", 1)
        key_id = key_id.strip()
        raw_status = raw_status.strip()
        if not key_id:
            continue
        try:
            status = int(raw_status)
        except ValueError:
            continue
        if status in VALID_SIMULATED_STATUSES:
            failures[key_id] = status
    return failures


def _is_retryable_exception(exc: Exception) -> bool:
    """Return True if the exception represents a 429, quota error, or 5xx/transient error."""
    if isinstance(exc, SimulatedProviderError):
        return True

    retryable_types = (
        litellm.RateLimitError,
        litellm.ServiceUnavailableError,
        litellm.InternalServerError,
        litellm.BadGatewayError,
        litellm.APIConnectionError,
        litellm.Timeout,
    )
    if isinstance(exc, retryable_types):
        return True

    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int) and (status_code == 429 or status_code >= 500):
        return True

    msg = str(exc).lower()
    if any(term in msg for term in ("429", "rate limit", "quota", "resource_exhausted", "500", "502", "503", "504")):
        return True

    return False


def _extract_usage(response: Any) -> tuple[int, int]:
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return 0, 0

    if isinstance(usage, dict):
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
    else:
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    return prompt_tokens, completion_tokens


def _extract_reply(response: Any) -> str:
    choices = getattr(response, "choices", None)
    if choices is None and isinstance(response, dict):
        choices = response.get("choices")
    if not choices:
        return ""
    first = choices[0]
    message = getattr(first, "message", None)
    if message is None and isinstance(first, dict):
        message = first.get("message")
    if message is None:
        return ""
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    return (content or "").strip()


def _is_cache_hit(response: Any) -> bool:
    hidden = getattr(response, "_hidden_params", None)
    if isinstance(hidden, dict):
        return bool(hidden.get("cache_hit", False))
    return False


def _check_litellm_cache(model: str, messages: list[dict[str, str]]) -> Optional[Any]:
    """Check LiteLLM cache directly without invoking any provider key."""
    cache_obj = getattr(litellm, "cache", None)
    if cache_obj is None:
        return None
    try:
        cached = cache_obj.get_cache(model=model, messages=messages)
        if cached is not None:
            return cached
    except Exception:
        return None
    return None


def complete_with_failover(
    settings: Settings,
    messages: list[dict[str, str]],
    simulate_failure_header: Optional[str] = None,
) -> GatewayResult:
    """Run LiteLLM completion with caching and automatic key failover."""
    if not settings.key_pool:
        raise AllProvidersUnavailableError("No LLM API keys configured")

    start = time.perf_counter()

    failures: dict[str, int] = {}
    if settings.enable_failure_simulation:
        failures = parse_simulate_failure_header(simulate_failure_header)

    # Check cache first so cache hits never touch provider keys or trigger simulated key failures.
    cached_response = _check_litellm_cache(settings.llm_model, messages)
    if cached_response is not None:
        reply_text = _extract_reply(cached_response)
        if reply_text:
            input_tokens, output_tokens = _extract_usage(cached_response)
            latency_ms = max(1, int(round((time.perf_counter() - start) * 1000)))
            return GatewayResult(
                reply=reply_text,
                resolution_source="LLM_CACHE",
                model=settings.llm_model,
                latency_ms=latency_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                key_id=None,
                fallback_attempts=0,
            )

    fallback_attempts = 0
    last_error: Optional[Exception] = None

    for entry in settings.key_pool:
        simulated_status = failures.get("*") or failures.get(entry.key_id)
        try:
            if simulated_status is not None:
                raise SimulatedProviderError(entry.key_id, simulated_status)

            response = litellm.completion(
                model=settings.llm_model,
                messages=messages,
                api_key=entry.api_key,
                caching=True,
            )
            reply_text = _extract_reply(response)
            if not reply_text:
                raise litellm.InternalServerError(
                    message="Empty response from model",
                    llm_provider="litellm",
                    model=settings.llm_model,
                )

            cache_hit = _is_cache_hit(response)
            input_tokens, output_tokens = _extract_usage(response)
            latency_ms = max(1, int(round((time.perf_counter() - start) * 1000)))

            return GatewayResult(
                reply=reply_text,
                resolution_source="LLM_CACHE" if cache_hit else "LIVE_INFERENCE",
                model=settings.llm_model,
                latency_ms=latency_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                key_id=None if cache_hit else entry.key_id,
                fallback_attempts=0 if cache_hit else fallback_attempts,
            )

        except Exception as exc:
            last_error = exc
            if _is_retryable_exception(exc):
                fallback_attempts += 1
                logger.warning(
                    "Key %s failed (%s); failing over (attempt %d)",
                    entry.key_id,
                    type(exc).__name__,
                    fallback_attempts,
                )
                continue
            # Non-retryable error (e.g. bad request) still shouldn't leak keys/stack trace
            fallback_attempts += 1
            logger.error("Key %s raised non-retryable error: %s", entry.key_id, exc)
            continue

    logger.error("All %d configured keys failed. Last error: %s", len(settings.key_pool), last_error)
    raise AllProvidersUnavailableError("all providers unavailable")

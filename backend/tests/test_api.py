from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import litellm
import pytest
from fastapi.testclient import TestClient
from litellm.utils import ModelResponse

from app.config import settings
from app.db import init_db
from app.gateway import init_cache
from app.main import app


def _make_mock_response(content: str, prompt_tokens: int = 42, completion_tokens: int = 9, cache_hit: bool = False):
    resp = ModelResponse(
        choices=[{"message": {"role": "assistant", "content": content}}],
        usage={"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
        model=settings.llm_model,
    )
    resp._hidden_params = {"cache_hit": cache_hit}
    return resp


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    db_file = tmp_path / "test_app.db"
    monkeypatch.setenv("LLM_API_KEYS", "secret-key-one,secret-key-two")
    monkeypatch.setenv("LLM_MODEL", "gemini/gemini-2.0-flash")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    monkeypatch.setenv("ENABLE_FAILURE_SIMULATION", "true")
    monkeypatch.setenv("CACHE_TYPE", "local")
    settings.reload()
    init_db(settings.sqlite_path)
    init_cache(settings)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_health_endpoint(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data == {
        "status": "ok",
        "keys_configured": 2,
        "cache_enabled": True,
    }


def test_chat_validation_errors(client: TestClient):
    # Empty message after trimming
    res = client.post("/chat", json={"session_id": "s-val-1", "message": "   "})
    assert res.status_code == 422
    assert "detail" in res.json()

    # Over 4000 chars
    res = client.post("/chat", json={"session_id": "s-val-1", "message": "a" * 4001})
    assert res.status_code == 422

    # Empty session_id
    res = client.post("/chat", json={"session_id": "   ", "message": "hello"})
    assert res.status_code == 422

    # Malformed JSON
    res = client.post("/chat", content="{not-json", headers={"Content-Type": "application/json"})
    assert res.status_code == 422

    # Failed 422 requests must not create session history
    hist = client.get("/sessions/s-val-1/messages")
    assert hist.status_code == 404
    assert hist.json() == {"detail": "session not found"}


def test_live_inference_and_cache_hit_across_sessions(client: TestClient, monkeypatch):
    mock_completion = MagicMock()

    def fake_completion(model, messages, api_key, caching=True, **kwargs):
        resp = _make_mock_response("The capital of France is Paris.", prompt_tokens=42, completion_tokens=9)
        # Populate LiteLLM's cache manually if mocked, or simulate LiteLLM cache behavior
        if litellm.cache is not None:
            litellm.cache.add_cache(resp, model=model, messages=messages)
        return resp

    mock_completion.side_effect = fake_completion
    monkeypatch.setattr(litellm, "completion", mock_completion)

    # First call -> LIVE_INFERENCE
    r1 = client.post("/chat", json={"session_id": "s-cache-1", "message": "What is the capital of France?"})
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["session_id"] == "s-cache-1"
    assert d1["reply"] == "The capital of France is Paris."
    assert d1["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert d1["metadata"]["key_id"] == "key_1"
    assert d1["metadata"]["fallback_attempts"] == 0
    assert d1["metadata"]["input_tokens"] == 42
    assert d1["metadata"]["output_tokens"] == 9
    assert isinstance(d1["metadata"]["latency_ms"], int)
    assert mock_completion.call_count == 1

    # Same first message in a NEW session -> LLM_CACHE
    r2 = client.post("/chat", json={"session_id": "s-cache-2", "message": "What is the capital of France?"})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["session_id"] == "s-cache-2"
    assert d2["reply"] == "The capital of France is Paris."
    assert d2["metadata"]["resolution_source"] == "LLM_CACHE"
    assert d2["metadata"]["key_id"] is None
    assert d2["metadata"]["fallback_attempts"] == 0
    assert d2["metadata"]["input_tokens"] == 42
    assert d2["metadata"]["output_tokens"] == 9
    assert mock_completion.call_count == 1  # Not called again

    # Different message -> LIVE_INFERENCE
    r3 = client.post("/chat", json={"session_id": "s-cache-3", "message": "What is the capital of Germany?"})
    assert r3.status_code == 200
    assert r3.json()["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert mock_completion.call_count == 2


def test_multiturn_history_and_system_prompt(client: TestClient, monkeypatch):
    captured_messages = []

    def fake_completion(model, messages, api_key, caching=True, **kwargs):
        captured_messages.append(messages)
        last_user = messages[-1]["content"]
        return _make_mock_response(f"Reply to: {last_user}", prompt_tokens=30, completion_tokens=8)

    monkeypatch.setattr(litellm, "completion", fake_completion)

    r1 = client.post(
        "/chat",
        json={
            "session_id": "s-multi-1",
            "message": "My name is Alice.",
            "system_prompt": "Be brief.",
        },
    )
    assert r1.status_code == 200

    r2 = client.post(
        "/chat",
        json={
            "session_id": "s-multi-1",
            "message": "What is my name?",
        },
    )
    assert r2.status_code == 200

    # Second call must include system prompt + turn 1 + turn 2
    assert captured_messages[1] == [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "My name is Alice."},
        {"role": "assistant", "content": "Reply to: My name is Alice."},
        {"role": "user", "content": "What is my name?"},
    ]

    # GET /sessions/{session_id}/messages returns history without system prompt
    hist = client.get("/sessions/s-multi-1/messages")
    assert hist.status_code == 200
    msgs = hist.json()["messages"]
    assert len(msgs) == 4
    assert msgs[0] == {"role": "user", "content": "My name is Alice.", "metadata": None}
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["content"] == "Reply to: My name is Alice."
    assert msgs[1]["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert msgs[2]["content"] == "What is my name?"


def test_provider_failover_and_all_keys_exhausted(client: TestClient, monkeypatch):
    def fake_completion(model, messages, api_key, caching=True, **kwargs):
        if api_key == "secret-key-one":
            raise litellm.RateLimitError(
                message="429 Too Many Requests",
                llm_provider="gemini",
                model=model,
            )
        return _make_mock_response("Recovered via key_2", prompt_tokens=20, completion_tokens=5)

    monkeypatch.setattr(litellm, "completion", fake_completion)

    res = client.post("/chat", json={"session_id": "s-fail-1", "message": "Test failover"})
    assert res.status_code == 200
    data = res.json()
    assert data["reply"] == "Recovered via key_2"
    assert data["metadata"]["key_id"] == "key_2"
    assert data["metadata"]["fallback_attempts"] == 1

    # Now make both keys fail -> 503 and nothing added to history
    def fake_all_fail(model, messages, api_key, caching=True, **kwargs):
        raise litellm.ServiceUnavailableError(
            message="503 Service Unavailable",
            llm_provider="gemini",
            model=model,
        )

    monkeypatch.setattr(litellm, "completion", fake_all_fail)
    res_503 = client.post("/chat", json={"session_id": "s-fail-all", "message": "Will fail"})
    assert res_503.status_code == 503
    assert res_503.json() == {"detail": "all providers unavailable"}

    hist = client.get("/sessions/s-fail-all/messages")
    assert hist.status_code == 404


def test_simulate_failure_header(client: TestClient, monkeypatch):
    def fake_completion(model, messages, api_key, caching=True, **kwargs):
        return _make_mock_response(f"Answered by {api_key}", prompt_tokens=15, completion_tokens=4)

    monkeypatch.setattr(litellm, "completion", fake_completion)

    # key_1=429 -> key_2 succeeds
    r1 = client.post(
        "/chat",
        json={"session_id": "s-sim-1", "message": "Sim 429"},
        headers={"X-Simulate-Failure": "key_1=429"},
    )
    assert r1.status_code == 200
    assert r1.json()["metadata"]["key_id"] == "key_2"
    assert r1.json()["metadata"]["fallback_attempts"] == 1

    # key_1=500 -> key_2 succeeds
    r2 = client.post(
        "/chat",
        json={"session_id": "s-sim-2", "message": "Sim 500"},
        headers={"X-Simulate-Failure": "key_1=500"},
    )
    assert r2.status_code == 200
    assert r2.json()["metadata"]["key_id"] == "key_2"
    assert r2.json()["metadata"]["fallback_attempts"] == 1

    # *=429 -> 503, nothing added to history
    r3 = client.post(
        "/chat",
        json={"session_id": "s-sim-3", "message": "Sim all fail"},
        headers={"X-Simulate-Failure": "*=429"},
    )
    assert r3.status_code == 503
    assert r3.json() == {"detail": "all providers unavailable"}
    assert client.get("/sessions/s-sim-3/messages").status_code == 404

    # When ENABLE_FAILURE_SIMULATION=false, header is ignored
    monkeypatch.setenv("ENABLE_FAILURE_SIMULATION", "false")
    settings.reload()
    r4 = client.post(
        "/chat",
        json={"session_id": "s-sim-4", "message": "Sim disabled"},
        headers={"X-Simulate-Failure": "*=429"},
    )
    assert r4.status_code == 200
    assert r4.json()["metadata"]["key_id"] == "key_1"

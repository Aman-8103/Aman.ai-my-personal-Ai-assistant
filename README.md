# Lyftr AI — LLM Chatbot with Key Failover and Response Caching

A full-stack multi-turn LLM chatbot built with **React**, **FastAPI**, **LiteLLM**, and **SQLite**, featuring automatic API key failover, per-request token & latency telemetry, and response caching.

---

## 1. Live URLs

- **Frontend:** `<your-deployed-frontend-url>` *(deploy `/frontend` to Vercel, Netlify, or Cloudflare Pages with `VITE_API_BASE_URL` pointing to the backend)*
- **Backend:** `<your-deployed-backend-url>` *(deploy `/backend` to Render, Railway, or Fly.io with a persistent `/data` volume)*

---

## 2. Run locally: with Docker and without

### Prerequisites
- Copy `.env.example` to `.env` and set at least two API keys in `LLM_API_KEYS`:
  ```bash
  cp .env.example .env
  ```

### With Docker
```bash
make up
```
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Stop services:
  ```bash
  make down
  ```

### Without Docker

**Backend:**
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
The frontend will run on `http://localhost:3000` and connect to `http://localhost:8000`.

**Run backend tests:**
```bash
cd backend
pytest -v
```

---

## 3. Design decisions: key fallback, caching, SQLite session storage

- **Key fallback (`backend/app/gateway.py`):** `LLM_API_KEYS` is parsed into an ordered pool (`key_1`, `key_2`, ...). Each `POST /chat` miss iterates through the key pool sequentially. On HTTP `429`, quota exhaustion, `5xx`, or transient connection/timeout errors—or when `X-Simulate-Failure` triggers a simulated status with `ENABLE_FAILURE_SIMULATION=true`—the gateway increments `fallback_attempts` and fails over to the next key. If every key fails, it raises `AllProvidersUnavailableError`, returning a clean `503 {"detail": "all providers unavailable"}` without mutating session history.
- **Response caching (`backend/app/gateway.py`):** LiteLLM's built-in cache (`litellm.Cache(type="local")` by default, or `disk`) is initialized at startup and keyed by `model` + the full message list (`system prompt + history + new message`). Cache lookup happens before key iteration so cache hits return immediately with `resolution_source: "LLM_CACHE"`, `key_id: null`, `fallback_attempts: 0`, and the stored token counts—ensuring cache hits are significantly faster than live calls and never consume provider quota.
- **SQLite session storage (`backend/app/db.py`):** Uses Python's built-in `sqlite3` with `WAL` journal mode and auto-created schema (`messages` and `sessions` tables). Each successful turn atomically writes both the `user` and `assistant` rows inside a single transaction; failed `422` or `503` requests never pollute session history. `GET /sessions/{session_id}/messages` returns messages oldest-first without the system prompt.

---

## 4. Verification: how to see failover, cache hits and per-message token usage

1. **Health check:**
   ```bash
   curl http://localhost:8000/health
   # {"status":"ok","keys_configured":2,"cache_enabled":true}
   ```

2. **Live inference & per-message token usage:**
   ```bash
   curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"session_id":"demo-1","message":"What is the capital of France?"}'
   ```
   Observe `"resolution_source": "LIVE_INFERENCE"`, `"key_id": "key_1"`, and per-request `input_tokens` / `output_tokens`.

3. **Cache hit across a new session:**
   Send the exact same first message with a new `session_id`:
   ```bash
   curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"session_id":"demo-2","message":"What is the capital of France?"}'
   ```
   Observe `"resolution_source": "LLM_CACHE"`, `"key_id": null`, `"fallback_attempts": 0`, and lower `latency_ms`.

4. **Failover with `X-Simulate-Failure`:**
   ```bash
   curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -H "X-Simulate-Failure: key_1=429" \
     -d '{"session_id":"demo-3","message":"Explain consistent hashing briefly."}'
   ```
   Observe `"key_id": "key_2"` and `"fallback_attempts": 1`.

   Simulate all keys failing:
   ```bash
   curl -i -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -H "X-Simulate-Failure: *=429" \
     -d '{"session_id":"demo-4","message":"This should fail"}'
   ```
   Returns `HTTP 503 {"detail":"all providers unavailable"}` and `GET /sessions/demo-4/messages` returns `404`.

---

## 5. Setup Used: your editor and AI tools

- **Editor / IDE:** Antigravity IDE
- **AI Tools:** Gemini 4 Hydrogen (Medium)

---

## 6. Bonus features (if any): what you added beyond the requirements and why

- **In-UI Failover Simulator selector:** A compact header selector (`Off`, `key_1=429`, `key_1=500`, `*=429`) that attaches `X-Simulate-Failure` directly from the browser for effortless live verification alongside `curl`.
- **Live Gateway Health indicator:** Polls `GET /health` on load to display configured key count and cache status in the header.
- **Session system prompt persistence (`sessions` table):** Stores per-session `system_prompt` overrides in SQLite so multi-turn conversations preserve their system prompt across turns without exposing it in `GET /sessions/{session_id}/messages`.

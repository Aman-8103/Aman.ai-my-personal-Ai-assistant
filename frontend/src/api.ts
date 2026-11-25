import { ChatResponse, HealthResponse, SessionHistoryResponse } from "./types";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) {
    throw new ApiError(res.status, "Backend health check failed");
  }
  return res.json();
}

export async function fetchSessionMessages(
  sessionId: string
): Promise<SessionHistoryResponse> {
  const res = await fetch(
    `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/messages`
  );
  if (!res.ok) {
    throw new ApiError(res.status, "Session not found");
  }
  return res.json();
}

export async function sendChatMessage(params: {
  sessionId: string;
  message: string;
  systemPrompt?: string;
  simulateFailure?: string;
  signal?: AbortSignal;
}): Promise<ChatResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (params.simulateFailure) {
    headers["X-Simulate-Failure"] = params.simulateFailure;
  }

  const body: Record<string, string> = {
    session_id: params.sessionId,
    message: params.message,
  };

  if (params.systemPrompt && params.systemPrompt.trim().length > 0) {
    body.system_prompt = params.systemPrompt.trim();
  }

  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const errBody = await res.json();
      if (typeof errBody?.detail === "string") {
        detail = errBody.detail;
      } else if (Array.isArray(errBody?.detail) && errBody.detail[0]?.msg) {
        detail = errBody.detail[0].msg;
      }
    } catch {
      // keep fallback detail
    }
    throw new ApiError(res.status, detail);
  }

  return res.json();
}

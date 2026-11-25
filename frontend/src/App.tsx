import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ApiError,
  fetchHealth,
  fetchSessionMessages,
  sendChatMessage,
} from "./api";
import { ChatComposer } from "./components/ChatComposer";
import { EmptyChat } from "./components/EmptyChat";
import { Header } from "./components/Header";
import { LogoGlow } from "./components/LogoGlow";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { HealthResponse, SessionSummary, UiMessage } from "./types";

const SESSIONS_STORAGE_KEY = "lyftr_sessions_v1";

function generateSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `s-${rand}`;
}

function loadSavedSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  // Always start a fresh session on each page load (contract requirement)
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId());
  const [sessions, setSessions] = useState<SessionSummary[]>(() =>
    loadSavedSessions()
  );
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState<boolean>(false);
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<boolean>(false);
  const [simulateFailure, setSimulateFailure] = useState<string>("");
  const [scrolled, setScrolled] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    fetchHealth()
      .then((data) => {
        if (active) {
          setHealth(data);
          setHealthError(false);
        }
      })
      .catch(() => {
        if (active) setHealthError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)));
    } catch {
      // ignore storage quota errors
    }
  }, [sessions]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const registerSession = useCallback((id: string, firstMessage: string) => {
    setSessions((prev) => {
      if (prev.some((s) => s.id === id)) return prev;
      const title =
        firstMessage.length > 36
          ? `${firstMessage.slice(0, 36)}…`
          : firstMessage;
      return [{ id, title, createdAt: Date.now() }, ...prev];
    });
  }, []);

  const handleNewChat = useCallback(() => {
    abortControllerRef.current?.abort();
    setLoading(false);
    setSessionId(generateSessionId());
    setMessages([]);
    setInput("");
  }, []);

  const handleSelectSession = useCallback(async (targetId: string) => {
    abortControllerRef.current?.abort();
    setLoading(false);
    setSessionId(targetId);
    setInput("");
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
    try {
      const data = await fetchSessionMessages(targetId);
      const loaded: UiMessage[] = data.messages.map((m, idx) => ({
        id: `${targetId}-${idx}`,
        role: m.role,
        content: m.content,
        metadata: m.metadata ?? undefined,
      }));
      setMessages(loaded);
    } catch {
      setMessages([]);
    }
  }, []);

  const handleDeleteSession = useCallback(
    (targetId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== targetId));
      if (targetId === sessionId) {
        abortControllerRef.current?.abort();
        setLoading(false);
        setSessionId(generateSessionId());
        setMessages([]);
        setInput("");
      }
    },
    [sessionId]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  }, []);

  const submitMessage = async (textOverride?: string) => {
    const raw = textOverride !== undefined ? textOverride : input;
    const trimmed = raw.trim();
    if (!trimmed || loading) return;

    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await sendChatMessage({
        sessionId,
        message: trimmed,
        systemPrompt,
        simulateFailure: simulateFailure || undefined,
        signal: controller.signal,
      });

      registerSession(sessionId, trimmed);

      const assistantMsg: UiMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        metadata: res.metadata,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      const status = err instanceof ApiError ? err.status : undefined;
      const detail =
        err instanceof Error
          ? err.message
          : "Unable to reach the gateway service.";

      const errorMsg: UiMessage = {
        id: `e-${Date.now()}`,
        role: "error",
        content: detail,
        errorStatus: status,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const isLanding = messages.length === 0;

  return (
    <div className="app-root">
      {/* LAYER 1: Midnight Navy + Burgundy Atmospheric Background */}
      <div className="bg-layer" aria-hidden="true" />

      {/* LAYER 2: Isolated 3D LyftrAI Neural Core */}
      <LogoGlow isThinking={loading} isLanding={isLanding} />

      {/* LAYER 3: Interface (Sidebar + Main Conversation Shell) */}
      <div className="layout-frame">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((p) => !p)}
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={(id) => void handleSelectSession(id)}
          onDeleteSession={handleDeleteSession}
          onNewChat={handleNewChat}
          systemPrompt={systemPrompt}
          onChangeSystemPrompt={setSystemPrompt}
        />

        <div className="main-stage">
          <Header
            onToggleSidebar={() => setSidebarOpen((p) => !p)}
            simulateFailure={simulateFailure}
            onChangeSimulateFailure={setSimulateFailure}
            health={health}
            healthError={healthError}
            scrolled={scrolled}
          />

          {/* System Prompt Bar (always mounted for testability, smoothly revealed on toggle) */}
          <motion.div
            initial={false}
            animate={{
              height: showSystemPrompt ? "auto" : 0,
              opacity: showSystemPrompt ? 1 : 0,
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ overflow: "hidden", zIndex: 12, flexShrink: 0 }}
          >
            <div className="system-bar">
              <div className="system-bar-inner">
                <label htmlFor="system-prompt" className="system-label">
                  System prompt
                </label>
                <input
                  id="system-prompt"
                  data-testid="system-prompt-input"
                  type="text"
                  className="system-input"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Optional system instruction for this session..."
                />
              </div>
            </div>
          </motion.div>

          <main
            ref={scrollContainerRef}
            className="chat-scroll"
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 12)}
          >
            <div className={`chat-column ${isLanding ? "is-landing" : ""}`}>
              <AnimatePresence mode="wait">
                {isLanding ? (
                  <EmptyChat
                    key="empty"
                    onSelectPrompt={(p) => void submitMessage(p)}
                  />
                ) : (
                  <MessageList
                    key="stream"
                    messages={messages}
                    loading={loading}
                  />
                )}
              </AnimatePresence>
              <div ref={scrollEndRef} />
            </div>
          </main>

          <div className={`composer-dock ${isLanding ? "landing-dock" : ""}`}>
            <ChatComposer
              input={input}
              onChange={setInput}
              onSubmit={() => void submitMessage()}
              onStop={handleStop}
              onToggleSystemPrompt={() => setShowSystemPrompt((p) => !p)}
              showSystemPrompt={showSystemPrompt}
              hasSystemPrompt={systemPrompt.trim().length > 0}
              loading={loading}
              isLanding={isLanding}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

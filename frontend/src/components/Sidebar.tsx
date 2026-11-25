import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { SessionSummary } from "../types";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  sessions: SessionSummary[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  systemPrompt: string;
  onChangeSystemPrompt: (val: string) => void;
}

export function Sidebar({
  open,
  onToggle,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  systemPrompt,
  onChangeSystemPrompt,
}: SidebarProps) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);

  useEffect(() => {
    const closeMenu = () => setMenuSessionId(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const todaySessions = sessions.filter((s) => now - s.createdAt < oneDay);
  const olderSessions = sessions.filter((s) => now - s.createdAt >= oneDay);

  const renderSessionRow = (s: SessionSummary) => {
    const isActive = s.id === activeSessionId;
    const isMenuOpen = menuSessionId === s.id;

    return (
      <div
        key={s.id}
        className={`sidebar-item-wrap ${isActive ? "active" : ""}`}
      >
        <button
          type="button"
          className="sidebar-item-btn"
          onClick={() => onSelectSession(s.id)}
        >
          <MessageSquare size={15} className="sidebar-item-icon" />
          <span className="sidebar-item-text">{s.title}</span>
        </button>

        <button
          type="button"
          className="session-more-btn"
          aria-label={`Options for ${s.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuSessionId(isMenuOpen ? null : s.id);
          }}
        >
          <MoreHorizontal size={14} />
        </button>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.14 }}
              className="session-context-menu"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="session-delete-btn"
                onClick={() => {
                  setMenuSessionId(null);
                  onDeleteSession(s.id);
                }}
              >
                <Trash2 size={13} />
                <span>Delete chat</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Far-Left Icon Rail (No profile DP, no system prompt icon) */}
      <aside className="rail-desktop" aria-label="Primary navigation">
        <div className="rail-top">
          <button
            type="button"
            className="rail-icon-btn home"
            onClick={onNewChat}
            title="Aman.ai Home"
            aria-label="Aman.ai Home"
          >
            <Home size={19} />
          </button>

          <button
            type="button"
            className="rail-icon-btn"
            onClick={onToggle}
            title={open ? "Close sidebar" : "Open sidebar"}
            aria-label={open ? "Close sidebar" : "Open sidebar"}
          >
            {open ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>

          <button
            type="button"
            className="rail-icon-btn"
            onClick={onNewChat}
            title="New chat"
            aria-label="New chat"
          >
            <SquarePen size={19} />
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sidebar-backdrop mobile-only"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Expandable Sessions Drawer */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 292, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="sidebar-panel"
            aria-label="Chat history"
          >
            <div className="sidebar-inner">
              <div className="sidebar-header">
                <span className="sidebar-title">Chats</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onToggle}
                  aria-label="Close sidebar"
                >
                  <X size={16} />
                </button>
              </div>

              <button
                type="button"
                className="sidebar-new-btn"
                onClick={onNewChat}
              >
                <SquarePen size={16} />
                <span>New chat</span>
              </button>

              <div className="sidebar-scroll">
                {todaySessions.length > 0 && (
                  <div className="sidebar-group">
                    <div className="sidebar-group-label">Today</div>
                    {todaySessions.map(renderSessionRow)}
                  </div>
                )}

                {olderSessions.length > 0 && (
                  <div className="sidebar-group">
                    <div className="sidebar-group-label">Previous 7 Days</div>
                    {olderSessions.map(renderSessionRow)}
                  </div>
                )}

                {sessions.length === 0 && (
                  <div className="sidebar-empty">
                    Send a message to save your first chat session.
                  </div>
                )}
              </div>

              <div className="sidebar-footer">
                <div className="sidebar-footer-label">Active Session</div>
                <div className="sidebar-session-id">{activeSessionId}</div>
                {systemPrompt.trim() && (
                  <button
                    type="button"
                    className="sidebar-clear-prompt"
                    onClick={() => onChangeSystemPrompt("")}
                  >
                    Clear system prompt
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, SlidersHorizontal, Square } from "lucide-react";

interface ChatComposerProps {
  input: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onToggleSystemPrompt: () => void;
  showSystemPrompt: boolean;
  hasSystemPrompt: boolean;
  loading: boolean;
  isLanding: boolean;
}

export function ChatComposer({
  input,
  onChange,
  onSubmit,
  onStop,
  onToggleSystemPrompt,
  showSystemPrompt,
  hasSystemPrompt,
  loading,
  isLanding,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) {
      onStop();
    } else {
      onSubmit();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) {
        onSubmit();
      }
    }
  };

  return (
    <motion.div
      layout
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`composer-shell ${isLanding ? "landing" : "docked"}`}
    >
      <form className="composer-glass" onSubmit={handleFormSubmit}>
        <button
          type="button"
          className={`composer-slider-btn ${
            showSystemPrompt || hasSystemPrompt ? "active" : ""
          }`}
          onClick={onToggleSystemPrompt}
          title="System prompt settings"
          aria-label="Toggle system prompt"
          aria-expanded={showSystemPrompt}
        >
          <SlidersHorizontal size={15} />
        </button>

        <textarea
          ref={textareaRef}
          data-testid="chat-input"
          className="composer-textarea"
          rows={1}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Aman.ai anything..."
          disabled={loading}
          aria-label="Message Aman.ai"
        />

        {loading ? (
          <button
            type="button"
            data-testid="send-button"
            className="composer-action-btn stop"
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop generation"
          >
            <Square size={12} fill="currentColor" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="submit"
            data-testid="send-button"
            className="composer-action-btn send"
            disabled={input.trim().length === 0}
            aria-label="Send message"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        )}
      </form>
    </motion.div>
  );
}

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const STARTER_PROMPTS = [
  "What is the capital of France?",
  "Explain SQLite WAL mode concisely",
  "How does LLM response caching cut latency?",
];

interface EmptyChatProps {
  onSelectPrompt: (prompt: string) => void;
}

export function EmptyChat({ onSelectPrompt }: EmptyChatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="empty-landing"
    >
      <h1 className="empty-brand-title">Aman.ai</h1>
      <p className="empty-greeting">What can I help you with?</p>

      <div className="starter-pills">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="starter-pill"
            onClick={() => onSelectPrompt(prompt)}
          >
            <span>{prompt}</span>
            <ArrowUpRight size={13} className="starter-arrow" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}

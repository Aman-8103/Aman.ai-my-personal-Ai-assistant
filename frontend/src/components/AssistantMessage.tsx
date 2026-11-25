import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Database, Zap } from "lucide-react";
import { ChatMetadata } from "../types";

interface AssistantMessageProps {
  content: string;
  metadata: ChatMetadata;
}

export function AssistantMessage({ content, metadata }: AssistantMessageProps) {
  const isCache = metadata.resolution_source === "LLM_CACHE";

  return (
    <motion.article
      data-testid="assistant-message"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="assistant-row"
    >
      <div className="assistant-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>

      <div className="assistant-meta">
        <span
          data-testid="meta-source"
          className={`source-pill ${isCache ? "cache" : "live"}`}
        >
          {isCache ? <Database size={11} /> : <Zap size={11} />}
          {metadata.resolution_source}
        </span>

        <span className="meta-item">
          <span className="meta-label">model</span>
          <span data-testid="meta-model" className="meta-value">
            {metadata.model}
          </span>
        </span>

        <span className="meta-item">
          <span className="meta-label">latency</span>
          <span data-testid="meta-latency" className="meta-value">
            {metadata.latency_ms} ms
          </span>
        </span>

        <span className="meta-item">
          <span className="meta-label">in</span>
          <span data-testid="meta-input-tokens" className="meta-value">
            {metadata.input_tokens}
          </span>
        </span>

        <span className="meta-item">
          <span className="meta-label">out</span>
          <span data-testid="meta-output-tokens" className="meta-value">
            {metadata.output_tokens}
          </span>
        </span>

        {metadata.key_id && (
          <span className="meta-item">
            <span className="meta-label">key</span>
            <span className="meta-value">{metadata.key_id}</span>
          </span>
        )}

        {metadata.fallback_attempts > 0 && (
          <span className="failover-pill">
            {metadata.fallback_attempts} failover
          </span>
        )}
      </div>
    </motion.article>
  );
}

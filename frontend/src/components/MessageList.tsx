import { AlertCircle } from "lucide-react";
import { UiMessage } from "../types";
import { AssistantMessage } from "./AssistantMessage";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  messages: UiMessage[];
  loading: boolean;
}

export function MessageList({ messages, loading }: MessageListProps) {
  return (
    <div className="message-stream">
      {messages.map((msg) => {
        if (msg.role === "user") {
          return <UserMessage key={msg.id} content={msg.content} />;
        }

        if (msg.role === "error") {
          return (
            <div key={msg.id} className="msg-error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                {msg.errorStatus !== undefined && (
                  <span className="msg-error-code" style={{ marginRight: 8 }}>
                    HTTP {msg.errorStatus}
                  </span>
                )}
                <span>{msg.content}</span>
              </div>
            </div>
          );
        }

        return (
          <AssistantMessage
            key={msg.id}
            content={msg.content}
            metadata={msg.metadata!}
          />
        );
      })}

      {loading && <ThinkingIndicator />}
    </div>
  );
}

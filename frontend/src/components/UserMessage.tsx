import { motion } from "framer-motion";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="msg-row-user"
    >
      <div className="msg-bubble-user">{content}</div>
    </motion.div>
  );
}

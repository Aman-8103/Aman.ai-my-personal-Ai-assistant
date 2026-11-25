import { motion } from "framer-motion";

export function ThinkingIndicator() {
  const nodes = [
    { cx: 10, cy: 14, delay: 0 },
    { cx: 22, cy: 7, delay: 0.18 },
    { cx: 22, cy: 21, delay: 0.36 },
    { cx: 36, cy: 14, delay: 0.54 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="thinking-row"
      aria-live="polite"
      aria-label="Aman.ai is thinking"
    >
      <svg
        width="46"
        height="28"
        viewBox="0 0 46 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="thinking-svg"
      >
        <g stroke="rgba(0, 200, 248, 0.35)" strokeWidth="1.2">
          <line x1="10" y1="14" x2="22" y2="7" />
          <line x1="10" y1="14" x2="22" y2="21" />
          <line x1="22" y1="7" x2="36" y2="14" />
          <line x1="22" y1="21" x2="36" y2="14" />
          <line x1="22" y1="7" x2="22" y2="21" />
        </g>
        {nodes.map((node, idx) => (
          <motion.circle
            key={idx}
            cx={node.cx}
            cy={node.cy}
            r="3"
            fill={idx === 1 || idx === 2 ? "#c94572" : "#00C8F8"}
            animate={{
              scale: [0.85, 1.35, 0.85],
              opacity: [0.45, 1, 0.45],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: node.delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>
      <span className="thinking-label">Synthesizing…</span>
    </motion.div>
  );
}

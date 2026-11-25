import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ShieldAlert } from "lucide-react";

interface SimOption {
  value: string;
  label: string;
  hint: string;
}

const SIM_OPTIONS: SimOption[] = [
  { value: "", label: "Failover Sim: Off", hint: "Normal routing" },
  { value: "key_1=429", label: "Sim: key_1=429", hint: "Rate-limit key_1 → key_2" },
  { value: "key_1=500", label: "Sim: key_1=500", hint: "Server error key_1 → key_2" },
  { value: "*=429", label: "Sim: *=429", hint: "All keys fail → HTTP 503" },
];

interface SimDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export function SimDropdown({ value, onChange }: SimDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = SIM_OPTIONS.find((o) => o.value === value) || SIM_OPTIONS[0];

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="sim-dropdown" ref={containerRef}>
      <button
        type="button"
        className={`sim-trigger ${value ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Simulate provider failure"
      >
        <ShieldAlert size={13} className={value ? "sim-icon-active" : "sim-icon"} />
        <span>{selected.label}</span>
        <ChevronDown
          size={13}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            opacity: 0.7,
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="sim-menu"
            role="listbox"
          >
            {SIM_OPTIONS.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value || "off"}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`sim-option ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <div className="sim-option-text">
                    <span className="sim-option-label">{opt.label}</span>
                    <span className="sim-option-hint">{opt.hint}</span>
                  </div>
                  {isSelected && <Check size={13} className="sim-check" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

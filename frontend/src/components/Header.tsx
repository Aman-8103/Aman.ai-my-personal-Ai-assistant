import { Menu } from "lucide-react";
import { HealthResponse } from "../types";
import { SimDropdown } from "./SimDropdown";

interface HeaderProps {
  onToggleSidebar: () => void;
  simulateFailure: string;
  onChangeSimulateFailure: (val: string) => void;
  health: HealthResponse | null;
  healthError: boolean;
  scrolled: boolean;
}

export function Header({
  onToggleSidebar,
  simulateFailure,
  onChangeSimulateFailure,
  health,
  healthError,
  scrolled,
}: HeaderProps) {
  return (
    <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn mobile-only"
          onClick={onToggleSidebar}
          aria-label="Open chat history"
        >
          <Menu size={16} />
        </button>

        <div className="brand-lockup">
          <span className="brand-emblem" aria-hidden="true">
            <img
              src="/brand-avatar.png"
              alt="Aman.ai"
              className="brand-logo-img"
            />
          </span>
          <span className="brand-wordmark">
            Aman<span className="brand-wordmark-ai">.ai</span>
          </span>
        </div>
      </div>

      <div className="topbar-right">
        <SimDropdown
          value={simulateFailure}
          onChange={onChangeSimulateFailure}
        />

        <div className="health-pill" title="Gateway status">
          <span className={`status-dot ${healthError ? "offline" : ""}`} />
          {health ? (
            <span>
              {health.keys_configured} keys ·{" "}
              {health.cache_enabled ? "Cache" : "No cache"}
            </span>
          ) : healthError ? (
            <span>Offline</span>
          ) : (
            <span>Connecting</span>
          )}
        </div>
      </div>
    </header>
  );
}

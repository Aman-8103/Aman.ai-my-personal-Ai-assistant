import { Suspense, lazy, memo } from "react";

const LogoScene = lazy(() => import("./LogoScene"));

interface LogoGlowProps {
  isThinking: boolean;
  isLanding: boolean;
}

export const LogoGlow = memo(function LogoGlow({
  isThinking,
  isLanding,
}: LogoGlowProps) {
  const stageClass = [
    "ai-core-layer",
    isThinking ? "thinking" : isLanding ? "landing" : "idle",
  ].join(" ");

  return (
    <div className={stageClass} aria-hidden="true">
      <div className="ai-core-ambient-glow" />
      <div className="ai-core-mask">
        <Suspense fallback={null}>
          <LogoScene isThinking={isThinking} />
        </Suspense>
      </div>
    </div>
  );
});

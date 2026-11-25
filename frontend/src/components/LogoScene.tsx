import { Component, ReactNode, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";

interface CoreProps {
  isThinking: boolean;
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
  scrollRatioRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

function LyftrLogo3D({
  isThinking,
  mouseRef,
  scrollRatioRef,
  reducedMotion,
}: CoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useLoader(THREE.TextureLoader, "/lyftr-logo.png");

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (reducedMotion) {
      group.rotation.set(0.08, 0.2, 0);
      group.position.y = 0;
      return;
    }

    const t = state.clock.elapsedTime;
    // Slow 32-second full Y-axis rotation (slightly livelier when thinking)
    const speed = isThinking ? 0.34 : 0.195;
    group.rotation.y += delta * speed;

    // Gentle vertical float (~±10px) + subtle scroll response
    const targetY = Math.sin(t * 0.72) * 0.11 - scrollRatioRef.current * 0.16;
    group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.05);

    // Subtle X-axis tilt + smooth inertial mouse parallax
    const targetTiltX = 0.08 + mouseRef.current.y * 0.08;
    const targetTiltZ = -mouseRef.current.x * 0.06;
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetTiltX, 0.04);
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, targetTiltZ, 0.04);
  });

  return (
    <group ref={groupRef}>
      {/* Supplied LyftrAI 3D Holographic Emblem */}
      <mesh>
        <planeGeometry args={[3.45, 3.45]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={isThinking ? 0.98 : 0.88}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Subtle 3D Depth Halo Ring */}
      <mesh position={[0, 0, -0.06]}>
        <torusGeometry args={[1.82, 0.016, 16, 100]} />
        <meshStandardMaterial
          color="#0077C8"
          emissive="#00C8F8"
          emissiveIntensity={isThinking ? 0.9 : 0.45}
          transparent
          opacity={0.45}
        />
      </mesh>
    </group>
  );
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function ImageFallbackCore() {
  return (
    <img
      src="/lyftr-logo.png"
      alt=""
      className="fallback-core-img"
    />
  );
}

export default function LogoScene({ isThinking }: { isThinking: boolean }) {
  const mouseRef = useRef({ x: 0, y: 0 });
  const scrollRatioRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    const onMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 768) return;
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    const onScroll = () => {
      const scroller = document.querySelector(".chat-scroll");
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      scrollRatioRef.current = max > 0 ? scroller.scrollTop / max : 0;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  return (
    <SceneErrorBoundary fallback={<ImageFallbackCore />}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 5.2], fov: 42 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <ambientLight intensity={0.8} />
        <pointLight position={[3, 3, 4]} intensity={1.4} color="#00C8F8" />
        <pointLight position={[-3, -2, 3]} intensity={1.1} color="#9f254f" />
        <LyftrLogo3D
          isThinking={isThinking}
          mouseRef={mouseRef}
          scrollRatioRef={scrollRatioRef}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </SceneErrorBoundary>
  );
}

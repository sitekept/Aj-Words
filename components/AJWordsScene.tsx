"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { MathUtils, type Group } from "three";

const detectWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
};

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const handleChange = () => setReduced(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduced;
};

function SceneFallback() {
  return (
    <div className="aj-scene-fallback" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function CardStack({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current || reducedMotion) {
      return;
    }

    groupRef.current.rotation.x = MathUtils.damp(
      groupRef.current.rotation.x,
      -0.18 + state.mouse.y * 0.12,
      3.4,
      delta
    );
    groupRef.current.rotation.y = MathUtils.damp(
      groupRef.current.rotation.y,
      0.34 + state.mouse.x * 0.2,
      3.4,
      delta
    );
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.75) * 0.045;
  });

  return (
    <group ref={groupRef} rotation={[-0.18, 0.34, -0.03]}>
      <mesh position={[-0.36, -0.16, -0.2]} rotation={[0.02, 0.08, -0.12]}>
        <boxGeometry args={[2.45, 1.55, 0.08]} />
        <meshStandardMaterial color="#2D6F68" roughness={0.58} metalness={0.02} />
      </mesh>

      <mesh position={[0.3, 0.13, -0.08]} rotation={[-0.01, -0.1, 0.1]}>
        <boxGeometry args={[2.35, 1.48, 0.08]} />
        <meshStandardMaterial color="#4C5BD5" roughness={0.56} metalness={0.02} />
      </mesh>

      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[2.55, 1.62, 0.11]} />
        <meshStandardMaterial color="#FFFCF4" roughness={0.42} metalness={0.01} />
      </mesh>

      <mesh position={[-0.7, 0.48, 0.18]}>
        <boxGeometry args={[0.82, 0.08, 0.05]} />
        <meshStandardMaterial color="#CDEEE8" roughness={0.4} />
      </mesh>
      <mesh position={[0.54, 0.48, 0.18]}>
        <boxGeometry args={[0.66, 0.08, 0.05]} />
        <meshStandardMaterial color="#F8D7BE" roughness={0.4} />
      </mesh>

      <group position={[-0.48, -0.14, 0.2]} rotation={[0, 0, 0.06]}>
        <mesh position={[-0.18, 0, 0]} rotation={[0, 0, -0.24]}>
          <boxGeometry args={[0.13, 0.92, 0.06]} />
          <meshStandardMaterial color="#F26D5B" roughness={0.34} />
        </mesh>
        <mesh position={[0.18, 0, 0]} rotation={[0, 0, 0.24]}>
          <boxGeometry args={[0.13, 0.92, 0.06]} />
          <meshStandardMaterial color="#F26D5B" roughness={0.34} />
        </mesh>
        <mesh position={[0, -0.08, 0.03]}>
          <boxGeometry args={[0.42, 0.11, 0.06]} />
          <meshStandardMaterial color="#F26D5B" roughness={0.34} />
        </mesh>
      </group>

      <group position={[0.54, -0.1, 0.2]}>
        <mesh position={[0.17, 0.12, 0]}>
          <boxGeometry args={[0.14, 0.9, 0.06]} />
          <meshStandardMaterial color="#4C5BD5" roughness={0.35} />
        </mesh>
        <mesh position={[-0.02, -0.36, 0.02]} rotation={[0, 0, 0.22]}>
          <boxGeometry args={[0.54, 0.13, 0.06]} />
          <meshStandardMaterial color="#4C5BD5" roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

export function AJWordsScene() {
  const reducedMotion = useReducedMotion();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    setCanRender(detectWebGL());
  }, []);

  if (!canRender) {
    return <SceneFallback />;
  }

  return (
    <div className="aj-scene" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 4.6], fov: 34 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        frameloop={reducedMotion ? "demand" : "always"}
        fallback={<SceneFallback />}
      >
        <ambientLight intensity={1.25} />
        <directionalLight position={[3, 4, 4]} intensity={1.9} />
        <pointLight position={[-3, -2, 3]} intensity={1.8} color="#F26D5B" />
        <CardStack reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}

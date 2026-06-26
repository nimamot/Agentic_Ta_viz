import { createContext, useContext, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  easeInOutCubic,
  focusLayerOpacity,
  focusLayerScale,
  overviewLayerOpacity,
  smoothstep,
} from "./codebookClusterFocusTransition";

export const FocusBlendRefContext = createContext<MutableRefObject<number> | null>(null);

export function useFocusBlendRef(): MutableRefObject<number> {
  const ref = useContext(FocusBlendRefContext);
  if (!ref) throw new Error("useFocusBlendRef must be used within FocusBlendRefContext");
  return ref;
}

export function focusTransitionMultiplier(layer: "overview" | "focus", blend: number): number {
  return layer === "focus" ? focusLayerOpacity(blend) : overviewLayerOpacity(blend);
}

export type FocusTransitionPhase = "idle" | "running";

export function FocusBlendDriver({
  focusClusterId,
  blendRef,
  onPhaseChange,
}: {
  focusClusterId: string | null;
  blendRef: MutableRefObject<number>;
  onPhaseChange?: (phase: FocusTransitionPhase) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const target = focusClusterId ? 1 : 0;
  const lastPhase = useRef<FocusTransitionPhase>("idle");

  useFrame((_, delta) => {
    const prev = blendRef.current;
    const entering = target > prev;
    const next = THREE.MathUtils.damp(prev, target, entering ? 7.5 : 11, delta);
    const clamped = entering ? Math.min(target, next) : Math.max(target, next);

    if (Math.abs(clamped - prev) > 0.0001) {
      blendRef.current = clamped;
    } else if (prev !== target) {
      blendRef.current = target;
    }

    const settled = Math.abs(blendRef.current - target) < 0.001;
    if (!settled) invalidate();

    const phase: FocusTransitionPhase = settled ? "idle" : "running";
    if (phase !== lastPhase.current) {
      lastPhase.current = phase;
      onPhaseChange?.(phase);
    }
  });

  return null;
}

export function FocusTransitionRig({
  blendRef,
  overviewGroupRef,
  focusGroupRef,
  fogFar,
  focusFogFar,
}: {
  blendRef: MutableRefObject<number>;
  overviewGroupRef: MutableRefObject<THREE.Group | null>;
  focusGroupRef: MutableRefObject<THREE.Group | null>;
  fogFar: number;
  focusFogFar: number;
}) {
  const { scene } = useThree();

  useFrame(() => {
    const blend = blendRef.current;
    const overviewOp = overviewLayerOpacity(blend);
    const scale = focusLayerScale(blend);

    if (overviewGroupRef.current) {
      overviewGroupRef.current.visible = overviewOp > 0.02;
    }
    if (focusGroupRef.current) {
      focusGroupRef.current.visible = blend > 0.001;
      focusGroupRef.current.scale.setScalar(scale);
    }

    const fog = scene.fog;
    if (fog && fog instanceof THREE.Fog) {
      const far = THREE.MathUtils.lerp(fogFar, focusFogFar, smoothstep(0.2, 0.65, blend));
      fog.near = far * 0.42;
      fog.far = far;
    }
  });

  return null;
}

export function FocusTransitionCamera({
  blendRef,
  overviewDistance,
  focusDistance,
  focusHubOverviewPos,
}: {
  blendRef: MutableRefObject<number>;
  overviewDistance: number;
  focusDistance: number;
  focusHubOverviewPos: [number, number, number] | null;
}) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  useFrame(() => {
    const blend = blendRef.current;
    if (!controls || blend <= 0.001) return;

    const hub = focusHubOverviewPos
      ? new THREE.Vector3(...focusHubOverviewPos)
      : new THREE.Vector3();
    const origin = new THREE.Vector3(0, 0, 0);
    const t = easeInOutCubic(blend);
    const phase1 = 0.42;

    let target: THREE.Vector3;
    let dist: number;

    if (t <= phase1) {
      const p = easeInOutCubic(t / phase1);
      target = origin.clone().lerp(hub, p);
      dist = THREE.MathUtils.lerp(overviewDistance, Math.max(9, overviewDistance * 0.3), p);
    } else {
      const p = easeInOutCubic((t - phase1) / (1 - phase1));
      target = hub.clone().lerp(origin, p);
      const nearDist = Math.max(9, overviewDistance * 0.3);
      dist = THREE.MathUtils.lerp(nearDist, focusDistance, p);
    }

    const camPos = target.clone().add(new THREE.Vector3(dist * 0.08, dist * 0.12, dist));
    camera.position.copy(camPos);
    controls.target.copy(target);
    controls.minDistance = Math.max(4, dist * 0.18);
    controls.maxDistance = Math.max(40, dist * 2.6);
    controls.update();
  });

  return null;
}

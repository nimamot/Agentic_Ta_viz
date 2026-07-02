import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  buildCodebook3DLayout,
  buildClusterLabelAnchors,
  buildFocusedCluster3DLayout,
  clusterDropRadius,
  estimateAppendCodePosition,
  hubVisualRadius,
  type Codebook3DLayout,
  type CodeNode3D,
  type ClusterHub3D,
} from "../lib/codebookClusterLayout3d";
import {
  FocusBlendDriver,
  FocusBlendRefContext,
  FocusTransitionCamera,
  FocusTransitionRig,
  focusTransitionMultiplier,
  useFocusBlendRef,
  type FocusTransitionPhase,
} from "../lib/codebookFocusBlendRuntime";
import { codebook3dCursors, type Codebook3DCursorMode } from "../lib/codebook3dCursors";
import type { ClusterEntry } from "../lib/codebookReview";

interface CodeDragPending {
  code: string;
  fromClusterId: string;
  color: string;
  originPosition: [number, number, number];
  startX: number;
  startY: number;
}

interface CodeMoveFlight {
  code: string;
  fromClusterId: string;
  toClusterId: string;
  color: string;
  from: [number, number, number];
  to: [number, number, number];
  startTime: number;
}

interface LandingBurstVisual {
  position: [number, number, number];
  color: string;
  startTime: number;
}

interface CodeDragVisual {
  sourceKey: string | null;
  sourceClusterId: string | null;
  hoverDropClusterId: string | null;
  moveMode: boolean;
  ghost: {
    position: [number, number, number];
    color: string;
    code: string;
    origin: [number, number, number];
  } | null;
}

interface Codebook3DCursorContextValue {
  setMode: (mode: Codebook3DCursorMode) => void;
  dragging: MutableRefObject<boolean>;
  beginMoveMode: (pending: CodeDragPending) => void;
  commitDropOnCluster: (clusterId: string) => void;
  setHoverDropCluster: (clusterId: string | null) => void;
  codeDragVisual: CodeDragVisual;
  codeDragDidMove: MutableRefObject<boolean>;
}

const MOVE_FLIGHT_MS = 820;
const LANDING_FLASH_MS = 2000;
const CLICK_DRAG_THRESHOLD_PX = 6;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function arcPoint(
  from: [number, number, number],
  to: [number, number, number],
  t: number
): [number, number, number] {
  const lift = Math.max(1.2, Math.hypot(to[0] - from[0], to[2] - from[2]) * 0.12);
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2 + lift,
    (from[2] + to[2]) / 2,
  ];
  const u = 1 - t;
  return [
    u * u * from[0] + 2 * u * t * mid[0] + t * t * to[0],
    u * u * from[1] + 2 * u * t * mid[1] + t * t * to[1],
    u * u * from[2] + 2 * u * t * mid[2] + t * t * to[2],
  ];
}

const EMPTY_CODE_DRAG_VISUAL: CodeDragVisual = {
  sourceKey: null,
  sourceClusterId: null,
  hoverDropClusterId: null,
  moveMode: false,
  ghost: null,
};

const Codebook3DCursorContext = createContext<Codebook3DCursorContextValue | null>(null);

function useCodebook3DCursor() {
  const ctx = useContext(Codebook3DCursorContext);
  if (!ctx) throw new Error("useCodebook3DCursor must be used inside CodebookCluster3D");
  return ctx;
}

import type { HighlightedCode } from "./codebookClusterTypes";

export type { HighlightedCode };

interface CodebookCluster3DProps {
  sortedClusterIds: string[];
  clusterToCodes: Record<string, string[]>;
  clusterColor: Map<string, string>;
  clusters: Record<string, ClusterEntry>;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  onClearSelection: () => void;
  onMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  onExpandedClustersChange?: (clusterIds: string[]) => void;
  expandedClusterIds?: Set<string>;
  isSmallCodebook?: boolean;
  totalClusterCount?: number;
  isDark: boolean;
  hideChrome?: boolean;
  focusClusterId?: string | null;
  onExitFocus?: () => void;
  onFocusTransitionPhase?: (phase: FocusTransitionPhase) => void;
  /** Single-click on a code node — opens cluster focus in the graph wrapper. */
  onFocusCluster?: (code: string, clusterId: string) => void;
  /** Click a cluster hub/label in overview — opens focus without selecting a code. */
  onEnterClusterFocus?: (clusterId: string) => void;
  focusRemovingCode?: string | null;
}

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function truncateLabel(text: string, max = 36): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function disableRaycast(mesh: THREE.Mesh | null) {
  if (mesh) mesh.raycast = () => undefined;
}

const CLICK_FOCUS_DELAY_MS = 300;

function CodeSphere({
  node,
  highlighted,
  dimmed,
  hiddenByDrag,
  inDropCluster,
  landingFlash,
  enlarged,
  layerOpacity = 1,
  transitionLayer,
  canMove,
  exiting = false,
  onSelect,
}: {
  node: CodeNode3D;
  highlighted: boolean;
  dimmed: boolean;
  hiddenByDrag: boolean;
  inDropCluster: boolean;
  landingFlash: boolean;
  enlarged?: boolean;
  layerOpacity?: number;
  transitionLayer?: "overview" | "focus";
  canMove: boolean;
  exiting?: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const hoveredRef = useRef(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const selectTimerRef = useRef<number | null>(null);
  const suppressSelectRef = useRef(false);
  const blendRef = useFocusBlendRef();
  const invalidate = useThree((s) => s.invalidate);
  const {
    setMode,
    dragging,
    beginMoveMode,
    commitDropOnCluster,
    setHoverDropCluster,
    codeDragVisual,
    codeDragDidMove,
  } = useCodebook3DCursor();
  const color = useMemo(() => hexToThree(node.color), [node.color]);
  const inMoveMode = codeDragVisual.moveMode;
  const isSource = inMoveMode && codeDragVisual.sourceClusterId === node.clusterId;
  const canDropHere = inMoveMode && !isSource && !!canMove;
  const nodeRadius = enlarged ? 0.44 : 0.28;
  const showHoverPanel =
    (hoverOpen || highlighted) && !inMoveMode && !exiting && !hiddenByDrag;

  useLayoutEffect(() => {
    disableRaycast(glowRef.current);
    disableRaycast(coreRef.current);
    disableRaycast(ringRef.current);
  }, []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = materialRef.current;
    if (!mesh || !mat) return;

    if (exiting) {
      mesh.scale.lerp(new THREE.Vector3(0.05, 0.05, 0.05), delta * 14);
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, delta * 12);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0, delta * 12);
      const glow = glowRef.current;
      if (glow) {
        const glowMat = glow.material as THREE.MeshBasicMaterial;
        glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, 0, delta * 12);
      }
      invalidate();
      return;
    }

    const pulse = highlighted
      ? 1.55 + Math.sin(state.clock.elapsedTime * 5) * 0.1
      : landingFlash
        ? 1.65 + Math.sin(state.clock.elapsedTime * 9) * 0.18
        : inDropCluster
          ? 1.28 + Math.sin(state.clock.elapsedTime * 4) * 0.07
          : 1;
    const hover = hoveredRef.current ? 1.18 : 1;
    const target = pulse * hover;
    mesh.scale.lerp(new THREE.Vector3(target, target, target), delta * 10);

    const glow = glowRef.current;
    if (glow) glow.scale.setScalar(target * 1.45);

    const baseEmissive = dimmed
      ? 0.18
      : highlighted
        ? 0.95
        : landingFlash
          ? 1.15
          : inDropCluster
            ? 0.78
            : hoveredRef.current
              ? 0.62
              : 0.42;
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, baseEmissive, delta * 8);
    const baseOpacity = hiddenByDrag ? 0.12 : dimmed ? 0.55 : 1;
    const transitionMult = transitionLayer
      ? focusTransitionMultiplier(transitionLayer, blendRef.current)
      : 1;
    mat.opacity = baseOpacity * layerOpacity * transitionMult;

    if (hoveredRef.current || highlighted || inDropCluster || landingFlash || transitionLayer) {
      invalidate();
    }

    const ring = ringRef.current;
    if (ring) {
      const showRing = highlighted || hoveredRef.current || inDropCluster || landingFlash;
      ring.visible = showRing;
      if (showRing) {
        ring.scale.setScalar(
          highlighted ? 1.75 : landingFlash ? 2.1 : inDropCluster ? 1.6 : 1.45
        );
      }
    }
  });

  return (
    <group ref={groupRef} position={node.position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[nodeRadius, 20, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={dimmed ? 0.04 : inDropCluster ? 0.22 : 0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh
        ref={meshRef}
        userData={{ codebookNode: true, clusterId: node.clusterId, code: node.code }}
        onClick={(e) => {
          e.stopPropagation();
          if (codeDragDidMove.current || inMoveMode) return;
          if (suppressSelectRef.current) {
            suppressSelectRef.current = false;
            return;
          }
          if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
          selectTimerRef.current = window.setTimeout(() => {
            selectTimerRef.current = null;
            if (suppressSelectRef.current) {
              suppressSelectRef.current = false;
              return;
            }
            onSelect();
          }, CLICK_FOCUS_DELAY_MS);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          suppressSelectRef.current = true;
          if (selectTimerRef.current) {
            window.clearTimeout(selectTimerRef.current);
            selectTimerRef.current = null;
          }
          if (!canMove) return;
          if (inMoveMode) {
            if (canDropHere) commitDropOnCluster(node.clusterId);
            return;
          }
          beginMoveMode({
            code: node.code,
            fromClusterId: node.clusterId,
            color: node.color,
            originPosition: node.position,
            startX: e.clientX,
            startY: e.clientY,
          });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoveredRef.current = true;
          setHoverOpen(true);
          if (canDropHere) setHoverDropCluster(node.clusterId);
          if (!dragging.current && !codeDragVisual.ghost) setMode("node");
          invalidate();
        }}
        onPointerOut={() => {
          hoveredRef.current = false;
          setHoverOpen(false);
          if (!dragging.current && !codeDragVisual.ghost) setMode("orbit");
          invalidate();
        }}
      >
        <sphereGeometry args={[nodeRadius, 32, 32]} />
        <meshPhysicalMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.42}
          roughness={0.22}
          metalness={0.55}
          clearcoat={0.9}
          clearcoatRoughness={0.12}
          transparent
          opacity={1}
        />
      </mesh>

      <mesh ref={coreRef} scale={0.38}>
        <sphereGeometry args={[nodeRadius, 16, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={highlighted ? 0.55 : dimmed ? 0.08 : 0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={ringRef} visible={false} scale={1.45}>
        <sphereGeometry args={[nodeRadius, 20, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.22}
          wireframe
          depthWrite={false}
        />
      </mesh>

      {hiddenByDrag && (
        <mesh scale={1.35}>
          <sphereGeometry args={[nodeRadius, 16, 16]} />
          <meshBasicMaterial color={node.color} wireframe transparent opacity={0.72} depthWrite={false} />
        </mesh>
      )}

      {landingFlash && (
        <mesh scale={2.2}>
          <sphereGeometry args={[nodeRadius, 16, 16]} />
          <meshBasicMaterial
            color={node.color}
            transparent
            opacity={0.28}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {showHoverPanel && (
        <Html
          transform={false}
          center
          position={[0, enlarged ? 1.5 : 1.12, 0]}
          zIndexRange={[200, 100]}
          wrapperClass="codebook-3d-html-wrap"
          style={{ pointerEvents: "none" }}
        >
          <div
            className="codebook-node-hover-panel"
            style={{ ["--cluster-color" as string]: node.color }}
          >
            {node.code}
          </div>
        </Html>
      )}
    </group>
  );
}

function MapClusterLabel({
  hub,
  anchor,
  emphasized,
  onSelect,
}: {
  hub: ClusterHub3D;
  anchor: [number, number, number];
  emphasized: boolean;
  onSelect?: () => void;
}) {
  const { camera } = useThree();
  const invalidate = useThree((s) => s.invalidate);
  const shellRef = useRef<HTMLDivElement>(null);
  const ndc = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const el = shellRef.current;
    if (!el) return;
    ndc.set(anchor[0], anchor[1], anchor[2]).project(camera);
    const behind = ndc.z > 1;
    const offscreen =
      ndc.x < -1.12 || ndc.x > 1.12 || ndc.y < -1.12 || ndc.y > 1.12;
    const visible = !behind && !offscreen;
    el.style.visibility = visible ? "visible" : "hidden";
    el.style.opacity = visible ? (emphasized ? "1" : "0.9") : "0";
    invalidate();
  });

  return (
    <Html
      transform={false}
      position={anchor}
      center
      zIndexRange={[48, 0]}
      wrapperClass="codebook-3d-html-wrap"
      style={{ pointerEvents: onSelect ? "auto" : "none" }}
    >
      <div
        ref={shellRef}
        className={`codebook-3d-label codebook-3d-label--cluster codebook-3d-label--map ${emphasized ? "codebook-3d-label--map-active" : ""} ${onSelect ? "codebook-3d-label--map-clickable" : ""}`}
        style={{ ["--cluster-color" as string]: hub.color }}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={
          onSelect
            ? (e) => {
                e.stopPropagation();
                onSelect();
              }
            : undefined
        }
        onKeyDown={
          onSelect
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect();
                }
              }
            : undefined
        }
      >
        <span className="codebook-3d-label-name">{hub.label || `Cluster ${hub.clusterId}`}</span>
      </div>
    </Html>
  );
}

function ClusterLabel({
  hub,
  dimmed,
  hidden,
  showMeta = true,
}: {
  hub: ClusterHub3D;
  dimmed: boolean;
  hidden: boolean;
  showMeta?: boolean;
}) {
  if (hidden) return null;

  const labelPos: [number, number, number] = [
    hub.position[0],
    hub.position[1] + 3.4,
    hub.position[2],
  ];

  return (
    <Html
      transform={false}
      position={labelPos}
      center
      zIndexRange={[50, 0]}
      wrapperClass="codebook-3d-html-wrap"
      style={{ pointerEvents: "none" }}
    >
      <div
        className={`codebook-3d-label codebook-3d-label--cluster ${dimmed ? "codebook-3d-label--dim" : ""}`}
        style={{ ["--cluster-color" as string]: hub.color }}
      >
        <span className="codebook-3d-label-name">{truncateLabel(hub.label, 42)}</span>
        {showMeta && (
          <span className="codebook-3d-label-meta">
            #{hub.clusterId} · {hub.confidence}/5 · {hub.codeCount} codes
          </span>
        )}
      </div>
    </Html>
  );
}

const INITIAL_CAMERA_DISTANCE = 32;

function SceneControls({
  zoomEnabled,
  cameraDistance,
  orbitEnabled,
  blendRef,
}: {
  zoomEnabled: boolean;
  cameraDistance: number;
  orbitEnabled: boolean;
  blendRef: MutableRefObject<number>;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const invalidate = useThree((s) => s.invalidate);
  const didInit = useRef(false);
  const lastDistance = useRef(cameraDistance);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || blendRef.current > 0.04) return;
    if (!didInit.current || lastDistance.current !== cameraDistance) {
      camera.position.set(0, 0, cameraDistance);
      controls.target.set(0, 0, 0);
      controls.minDistance = Math.max(4, cameraDistance * 0.15);
      controls.maxDistance = Math.max(55, cameraDistance * 2.2);
      controls.update();
      didInit.current = true;
      lastDistance.current = cameraDistance;
    }
  });

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enableZoom = zoomEnabled;
    controls.enabled = orbitEnabled;
  }, [zoomEnabled, orbitEnabled]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0, 0]}
      enablePan={orbitEnabled}
      enableZoom={zoomEnabled}
      enableRotate={orbitEnabled}
      minDistance={6}
      maxDistance={55}
      dampingFactor={0.08}
      enableDamping
      onChange={() => invalidate()}
    />
  );
}

/** Clear selection / exit expanded clusters / exit focus on click-release over empty map space. */
function BackgroundDeselect({
  highlighted,
  expandedClusterIds,
  blendRef,
  onClear,
  onExitExpanded,
  onExitFocus,
}: {
  highlighted: HighlightedCode | null;
  expandedClusterIds: Set<string>;
  blendRef: MutableRefObject<number>;
  onClear: () => void;
  onExitExpanded: () => void;
  onExitFocus?: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const { codeDragVisual, codeDragDidMove } = useCodebook3DCursor();
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const start = pointerDown.current;
      pointerDown.current = null;
      if (!start) return;
      if (codeDragVisual.moveMode || codeDragVisual.ghost || codeDragDidMove.current) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) return;

      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      const hits = raycaster.intersectObjects(scene.children, true);
      const hitCode = hits.some((hit) => hit.object.userData?.codebookNode === true);
      if (hitCode) return;

      if (blendRef.current > 0.82 && onExitFocus) {
        onExitFocus();
        return;
      }

      const hitInteractive = hits.some(
        (hit) => hit.object.userData?.codebookHub === true
      );
      if (hitInteractive) return;

      if (expandedClusterIds.size > 0) {
        onExitExpanded();
        onClear();
      } else if (highlighted) {
        onClear();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    highlighted,
    expandedClusterIds,
    blendRef,
    onClear,
    onExitExpanded,
    onExitFocus,
    camera,
    gl,
    scene,
    raycaster,
    ndc,
    codeDragVisual.ghost,
    codeDragDidMove,
  ]);

  return null;
}


function CodeDragController({
  onMoveCode,
  onSelectCode,
  onVisualChange,
  registerBeginMoveMode,
  registerCommitDrop,
  resolveDropDestination,
  onBeginFlight,
  flightActive,
}: {
  onMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  onSelectCode: (code: string, clusterId: string) => void;
  onVisualChange: (visual: CodeDragVisual) => void;
  registerBeginMoveMode: (fn: (pending: CodeDragPending) => void) => void;
  registerCommitDrop: (fn: (clusterId: string) => void) => void;
  resolveDropDestination: (toClusterId: string) => [number, number, number];
  onBeginFlight: (flight: Omit<CodeMoveFlight, "startTime">) => void;
  flightActive: boolean;
}) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const { setMode, codeDragDidMove } = useCodebook3DCursor();
  const activeRef = useRef<CodeDragPending | null>(null);

  const endMoveMode = useCallback(() => {
    activeRef.current = null;
    onVisualChange(EMPTY_CODE_DRAG_VISUAL);
    if (controls) controls.enabled = true;
    codeDragDidMove.current = false;
    setMode("orbit");
  }, [controls, onVisualChange, codeDragDidMove, setMode]);

  const tryCommitDrop = useCallback(
    (clusterId: string) => {
      const drag = activeRef.current;
      if (!drag || !onMoveCode || clusterId === drag.fromClusterId || flightActive) return false;
      const to = resolveDropDestination(clusterId);
      onBeginFlight({
        code: drag.code,
        fromClusterId: drag.fromClusterId,
        toClusterId: clusterId,
        color: drag.color,
        from: drag.originPosition,
        to,
      });
      endMoveMode();
      return true;
    },
    [endMoveMode, flightActive, onBeginFlight, onMoveCode, resolveDropDestination]
  );

  useEffect(() => {
    registerBeginMoveMode((pending: CodeDragPending) => {
      if (!onMoveCode || flightActive) return;
      activeRef.current = pending;
      codeDragDidMove.current = true;
      onSelectCode(pending.code, pending.fromClusterId);
      if (controls) controls.enabled = true;
      setMode("node");
      onVisualChange({
        sourceKey: `${pending.fromClusterId}:${pending.code}`,
        sourceClusterId: pending.fromClusterId,
        hoverDropClusterId: null,
        moveMode: true,
        ghost: {
          position: pending.originPosition,
          color: pending.color,
          code: pending.code,
          origin: pending.originPosition,
        },
      });
    });
  }, [codeDragDidMove, controls, flightActive, onMoveCode, onSelectCode, onVisualChange, registerBeginMoveMode, setMode]);

  useEffect(() => {
    registerCommitDrop((clusterId: string) => {
      tryCommitDrop(clusterId);
    });
  }, [registerCommitDrop, tryCommitDrop]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeRef.current) endMoveMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [endMoveMode]);

  return null;
}

function MoveFlightGhost({
  flight,
  onComplete,
}: {
  flight: CodeMoveFlight;
  onComplete: () => void;
}) {
  const [position, setPosition] = useState<[number, number, number]>(flight.from);
  const doneRef = useRef(false);

  useFrame(() => {
    if (doneRef.current) return;
    const t = Math.min(1, (performance.now() - flight.startTime) / MOVE_FLIGHT_MS);
    const eased = easeOutCubic(t);
    const next = arcPoint(flight.from, flight.to, eased);
    setPosition(next);
    if (t >= 1) {
      doneRef.current = true;
      onComplete();
    }
  });

  return (
    <DragGhost
      position={position}
      color={flight.color}
      code={flight.code}
      origin={flight.from}
      trailOpacity={0.78}
    />
  );
}

function LandingBurst({ burst }: { burst: LandingBurstVisual }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const threeColor = useMemo(() => hexToThree(burst.color), [burst.color]);

  useFrame(() => {
    if (!ringRef.current) return;
    const t = Math.min(1, (performance.now() - burst.startTime) / 700);
    const eased = easeOutCubic(t);
    ringRef.current.scale.setScalar(0.5 + eased * 2.8);
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - eased) * 0.75;
  });

  return (
    <group position={burst.position}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={800}>
        <ringGeometry args={[0.35, 0.55, 40]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={0.75}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function DragGhost({
  position,
  color,
  code,
  origin,
  trailOpacity = 0.55,
}: {
  position: [number, number, number];
  color: string;
  code: string;
  origin: [number, number, number];
  trailOpacity?: number;
}) {
  const threeColor = useMemo(() => hexToThree(color), [color]);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const pulse = 1.15 + Math.sin(state.clock.elapsedTime * 8) * 0.08;
    if (meshRef.current) meshRef.current.scale.setScalar(pulse);
    if (glowRef.current) glowRef.current.scale.setScalar(pulse * 1.65);
  });

  return (
    <>
      <Line
        points={[origin, position]}
        color={color}
        transparent
        opacity={trailOpacity}
        lineWidth={2.5}
        depthTest={false}
        renderOrder={999}
      />
      <group position={position} renderOrder={1000}>
      <mesh ref={glowRef} renderOrder={1001}>
        <sphereGeometry args={[0.52, 24, 24]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={meshRef} renderOrder={1002}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshPhysicalMaterial
          color={threeColor}
          emissive={threeColor}
          emissiveIntensity={1.1}
          roughness={0.15}
          metalness={0.55}
          clearcoat={0.95}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </mesh>
      <mesh renderOrder={1003} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.58, 0.04, 12, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <Html
        transform={false}
        center
        position={[0, 0.85, 0]}
        zIndexRange={[300, 200]}
        wrapperClass="codebook-3d-html-wrap"
        style={{ pointerEvents: "none" }}
      >
        <div className="codebook-3d-drag-ghost-label" style={{ ["--cluster-color" as string]: color }}>
          {truncateLabel(code, 32)}
        </div>
      </Html>
      </group>
    </>
  );
}

function ClusterDropField({
  clusterId,
  radius,
  color,
  active,
  visible,
  onHover,
  onDrop,
}: {
  clusterId: string;
  radius: number;
  color: string;
  active: boolean;
  visible: boolean;
  onHover: (hovered: boolean) => void;
  onDrop: () => void;
}) {
  const threeColor = useMemo(() => hexToThree(color), [color]);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z = state.clock.elapsedTime * (active ? 1.2 : 0.35);
  });

  if (!visible) return null;

  return (
    <group>
      <mesh
        userData={{ codebookHub: true, clusterId }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(false);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDrop();
        }}
      >
        <sphereGeometry args={[radius, 28, 28]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={active ? 500 : 100}>
        <ringGeometry args={[radius * 0.78, radius, 64]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={active ? 0.62 : 0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {active && (
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={501}>
          <ringGeometry args={[radius * 0.58, radius * 0.66, 48]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function ClusterEdge({
  a,
  b,
  color,
  opacity,
  lineWidth,
  transitionLayer,
}: {
  a: [number, number, number];
  b: [number, number, number];
  color: string;
  opacity: number;
  lineWidth: number;
  transitionLayer?: "overview" | "focus";
}) {
  const groupRef = useRef<THREE.Group>(null);
  const blendRef = useFocusBlendRef();
  const invalidate = useThree((s) => s.invalidate);
  const baseOpacity = opacity;

  useLayoutEffect(() => {
    groupRef.current?.traverse((obj) => {
      obj.raycast = () => undefined;
    });
  }, []);

  useFrame(() => {
    if (!transitionLayer || !groupRef.current) return;
    const mult = focusTransitionMultiplier(transitionLayer, blendRef.current);
    groupRef.current.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material;
      if (mat && "opacity" in mat && typeof mat.opacity === "number") {
        mat.opacity = baseOpacity * mult;
      }
    });
    invalidate();
  });

  return (
    <group ref={groupRef}>
      <Line
        points={[a, b]}
        color={color}
        transparent
        opacity={opacity}
        lineWidth={lineWidth}
      />
    </group>
  );
}

function ClusterHub({
  hub,
  active,
  pickable,
  isDropTarget,
  isMoveSource,
  showDropPreview,
  acceptCodeDrop,
  onFocus,
  onHoverChange,
  hubRaycastDisabled,
}: {
  hub: ClusterHub3D;
  active: boolean;
  pickable?: boolean;
  isDropTarget?: boolean;
  isMoveSource?: boolean;
  showDropPreview?: boolean;
  acceptCodeDrop?: boolean;
  onFocus?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  hubRaycastDisabled?: boolean;
}) {
  const color = useMemo(() => hexToThree(hub.color), [hub.color]);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { setMode, dragging, codeDragVisual, commitDropOnCluster, setHoverDropCluster } =
    useCodebook3DCursor();
  const acceptDrops = pickable || isDropTarget || isMoveSource || acceptCodeDrop;
  const hubRadius = hubVisualRadius(hub.codeCount, acceptDrops);
  const dropRadius = clusterDropRadius(hub.codeCount);

  useLayoutEffect(() => {
    if (acceptDrops && !hubRaycastDisabled) return;
    disableRaycast(coreRef.current);
    disableRaycast(ringRef.current);
  }, [acceptDrops, hubRaycastDisabled]);

  useFrame((state) => {
    if (!ringRef.current || (!isDropTarget && !isMoveSource)) return;
    ringRef.current.rotation.z = state.clock.elapsedTime * (isDropTarget ? 1.1 : 0.65);
    if (coreRef.current) {
      const pulse = isDropTarget
        ? 1.16 + Math.sin(state.clock.elapsedTime * 7) * 0.1
        : 1.1 + Math.sin(state.clock.elapsedTime * 4.5) * 0.06;
      coreRef.current.scale.setScalar(pulse);
    }
    invalidate();
  });

  return (
    <group position={hub.position}>
      <ClusterDropField
        clusterId={hub.clusterId}
        radius={dropRadius}
        color={hub.color}
        active={!!isDropTarget}
        visible={!!showDropPreview && !isMoveSource}
        onHover={(hovered) => setHoverDropCluster(hovered ? hub.clusterId : null)}
        onDrop={() => commitDropOnCluster(hub.clusterId)}
      />
      <mesh
        ref={coreRef}
        userData={acceptDrops ? { codebookHub: true, clusterId: hub.clusterId } : undefined}
        onClick={
          pickable && !acceptCodeDrop
            ? (e) => {
                e.stopPropagation();
                onFocus?.();
              }
            : undefined
        }
        onDoubleClick={
          acceptCodeDrop && !isMoveSource
            ? (e) => {
                e.stopPropagation();
                commitDropOnCluster(hub.clusterId);
              }
            : undefined
        }
        onPointerOver={
          acceptDrops
            ? (e) => {
                e.stopPropagation();
                onHoverChange?.(true);
                if (acceptCodeDrop && !isMoveSource) setHoverDropCluster(hub.clusterId);
                if (!dragging.current && !codeDragVisual.ghost) setMode("node");
              }
            : undefined
        }
        onPointerOut={
          acceptDrops
            ? () => {
                onHoverChange?.(false);
                if (!dragging.current && !codeDragVisual.ghost) setMode("orbit");
              }
            : undefined
        }
      >
        <sphereGeometry args={[hubRadius, acceptDrops ? 28 : 16, acceptDrops ? 28 : 16]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={
            isDropTarget
              ? 1.2
              : isMoveSource
                ? 1.05
                : active
                  ? 0.85
                  : pickable
                    ? 0.5
                    : 0.2
          }
          roughness={0.25}
          metalness={0.45}
          clearcoat={0.75}
          transparent
          opacity={acceptDrops ? 1 : active ? 0.95 : 0.45}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[hubRadius * 1.35, acceptDrops ? 0.045 : 0.028, 10, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={
            isDropTarget
              ? 0.95
              : isMoveSource
                ? 0.82
                : active
                  ? 0.65
                  : pickable
                    ? 0.35
                    : 0.22
          }
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Scene({
  overviewLayout,
  focusLayout,
  blendRef,
  lingerFocusId,
  focusClusterId,
  highlighted,
  expandedClusterIds,
  hoveredHubId,
  forceShowAllCodes,
  codeDragVisual,
  onSelectCode,
  onClearSelection,
  onToggleCluster,
  onHoverHub,
  onMoveCode,
  onCodeDragVisualChange,
  registerBeginMoveMode,
  registerCommitDrop,
  resolveDropDestination,
  onBeginFlight,
  onFlightComplete,
  moveFlight,
  landingBurst,
  landedCode,
  onExitFocus,
  onPhaseChange,
  onFocusCluster,
  onEnterClusterFocus,
  focusRemovingCode = null,
  isDark,
  zoomEnabled,
}: {
  overviewLayout: Codebook3DLayout;
  focusLayout: Codebook3DLayout | null;
  blendRef: MutableRefObject<number>;
  lingerFocusId: string | null;
  focusClusterId: string | null;
  highlighted: HighlightedCode | null;
  expandedClusterIds: Set<string>;
  hoveredHubId: string | null;
  forceShowAllCodes: boolean;
  codeDragVisual: CodeDragVisual;
  onSelectCode: (code: string, clusterId: string) => void;
  onClearSelection: () => void;
  onToggleCluster: (clusterId: string) => void;
  onHoverHub: (clusterId: string | null) => void;
  onMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  onCodeDragVisualChange: (visual: CodeDragVisual) => void;
  registerBeginMoveMode: (fn: (pending: CodeDragPending) => void) => void;
  registerCommitDrop: (fn: (clusterId: string) => void) => void;
  resolveDropDestination: (toClusterId: string) => [number, number, number];
  onBeginFlight: (flight: Omit<CodeMoveFlight, "startTime">) => void;
  onFlightComplete: (flight: CodeMoveFlight) => void;
  moveFlight: CodeMoveFlight | null;
  landingBurst: LandingBurstVisual | null;
  landedCode: { code: string; clusterId: string } | null;
  onExitFocus?: () => void;
  onPhaseChange?: (phase: FocusTransitionPhase) => void;
  onFocusCluster?: (code: string, clusterId: string) => void;
  onEnterClusterFocus?: (clusterId: string) => void;
  focusRemovingCode?: string | null;
  isDark: boolean;
  zoomEnabled: boolean;
}) {
  const overviewGroupRef = useRef<THREE.Group>(null);
  const focusGroupRef = useRef<THREE.Group>(null);
  const highlightCluster = highlighted?.clusterId ?? null;
  const hasCodeFocus = highlighted != null;
  const isCodeDragging = codeDragVisual.moveMode && codeDragVisual.ghost != null;
  const flightActive = moveFlight != null;
  const moveSourceClusterId = codeDragVisual.sourceClusterId;
  const hoverDropClusterId = codeDragVisual.hoverDropClusterId;
  const inFocusTransition = lingerFocusId != null;
  const hubInteractionsEnabled = !flightActive && !inFocusTransition;
  const canMoveNodes = !flightActive && !!onMoveCode;
  const fogFar = Math.max(58, overviewLayout.layoutRadius * 2.8);
  const focusFogFar = focusLayout ? Math.max(28, focusLayout.layoutRadius * 3.2) : fogFar;
  const mapLabelAnchors = useMemo(
    () => buildClusterLabelAnchors(overviewLayout),
    [overviewLayout]
  );
  const showMapClusterLabels =
    focusClusterId == null && !inFocusTransition;
  const focusHubOverviewPos = useMemo((): [number, number, number] | null => {
    if (!lingerFocusId) return null;
    const hub = overviewLayout.hubs.find((h) => h.clusterId === lingerFocusId);
    return hub?.position ?? null;
  }, [lingerFocusId, overviewLayout.hubs]);

  const renderLayer = (
    layout: Codebook3DLayout,
    layerKey: string,
    options: {
      enlarged: boolean;
      dimExceptClusterId: string | null;
      isFocusLayer: boolean;
      hubRaycastDisabled: boolean;
      transitionLayer: "overview" | "focus";
    }
  ) => {
    const { nodes, hubs, edges, isLargeDataset } = layout;
    const layerOverviewMode =
      !options.isFocusLayer &&
      !inFocusTransition &&
      isLargeDataset &&
      !forceShowAllCodes &&
      expandedClusterIds.size === 0;

    return (
      <group key={layerKey}>
        {!layerOverviewMode &&
          edges.map(([a, b], i) => {
            const clusterId = nodes[a].clusterId;
            const edgeActive =
              !hasCodeFocus ||
              clusterId === highlightCluster ||
              (options.dimExceptClusterId != null && clusterId === options.dimExceptClusterId);
            const edgeOpacity = edgeActive ? (highlighted ? 0.5 : 0.32) : 0.08;
            return (
              <ClusterEdge
                key={`${layerKey}-e-${i}`}
                a={nodes[a].position}
                b={nodes[b].position}
                color={nodes[a].color}
                opacity={edgeOpacity}
                lineWidth={edgeActive ? 1.5 : 1}
                transitionLayer={options.transitionLayer}
              />
            );
          })}

        {hubs.map((hub) => {
          if (options.isFocusLayer) return null;
          const isExpanded = expandedClusterIds.has(hub.clusterId);
          const useFocusOnHub = isLargeDataset && !!onEnterClusterFocus;
          const showPickable = !forceShowAllCodes && isLargeDataset;
          const isMoveSource = isCodeDragging && moveSourceClusterId === hub.clusterId;
          const isDropTarget = isCodeDragging && hoverDropClusterId === hub.clusterId;
          const hubDimmed =
            options.dimExceptClusterId != null && hub.clusterId !== options.dimExceptClusterId;
          return (
            <group key={`${layerKey}-hub-${hub.clusterId}`}>
              <ClusterHub
                hub={hub}
                active={!hubDimmed && (isExpanded || (hasCodeFocus && highlightCluster === hub.clusterId) || isMoveSource)}
                pickable={hubInteractionsEnabled && showPickable}
                isDropTarget={isDropTarget}
                isMoveSource={isMoveSource}
                showDropPreview={isCodeDragging && !isMoveSource}
                acceptCodeDrop={isCodeDragging}
                hubRaycastDisabled={options.hubRaycastDisabled}
                onFocus={() => {
                  if (useFocusOnHub) onEnterClusterFocus!(hub.clusterId);
                  else onToggleCluster(hub.clusterId);
                }}
                onHoverChange={(hovered) => onHoverHub(hovered ? hub.clusterId : null)}
              />
            </group>
          );
        })}

        {!layerOverviewMode &&
          nodes.map((node) => {
            if (!options.isFocusLayer && lingerFocusId && node.clusterId === lingerFocusId) {
              return null;
            }
            const nodeKey = `${node.clusterId}:${node.code}`;
            const isHighlighted =
              highlighted?.code === node.code && highlighted.clusterId === node.clusterId;
            const fadeOthers =
              options.dimExceptClusterId != null && node.clusterId !== options.dimExceptClusterId;
            const selectionAppliesToLayer =
              !hasCodeFocus ||
              !options.isFocusLayer ||
              !lingerFocusId ||
              highlighted!.clusterId === lingerFocusId;
            const dimmed =
              fadeOthers ||
              (isCodeDragging
                ? node.clusterId !== moveSourceClusterId &&
                  node.clusterId !== hoverDropClusterId &&
                  !isHighlighted
                : selectionAppliesToLayer &&
                  node.clusterId !== highlightCluster &&
                  !isHighlighted);
            const hiddenByDrag =
              codeDragVisual.sourceKey === nodeKey ||
              (moveFlight != null &&
                `${moveFlight.fromClusterId}:${moveFlight.code}` === nodeKey);
            const inDropCluster = isCodeDragging && hoverDropClusterId === node.clusterId;
            const landingFlash =
              landedCode?.code === node.code && landedCode.clusterId === node.clusterId;
            const nodeLayerOpacity = fadeOthers && inFocusTransition ? 0.08 : 1;
            const exiting =
              options.isFocusLayer &&
              focusRemovingCode != null &&
              node.code === focusRemovingCode &&
              node.clusterId === lingerFocusId;
            return (
              <CodeSphere
                key={`${layerKey}-${nodeKey}`}
                node={node}
                highlighted={isHighlighted}
                dimmed={dimmed}
                hiddenByDrag={hiddenByDrag}
                inDropCluster={inDropCluster}
                landingFlash={landingFlash}
                enlarged={options.enlarged}
                layerOpacity={nodeLayerOpacity}
                transitionLayer={options.transitionLayer}
                canMove={canMoveNodes}
                exiting={exiting}
                onSelect={() => {
                  const focus = onFocusCluster ?? onSelectCode;
                  focus(node.code, node.clusterId);
                }}
              />
            );
          })}

        {!options.isFocusLayer &&
          hubs.map((hub) => {
            if (lingerFocusId && hub.clusterId === lingerFocusId) return null;
            const isHovered = hoveredHubId === hub.clusterId;
            const isMoveSourceHub = isCodeDragging && moveSourceClusterId === hub.clusterId;
            const isDropTargetHub = isCodeDragging && hoverDropClusterId === hub.clusterId;
            const hubDimmed = inFocusTransition && hub.clusterId !== lingerFocusId;
            const isExpanded = expandedClusterIds.has(hub.clusterId);
            const emphasized =
              isHovered ||
              isMoveSourceHub ||
              isDropTargetHub ||
              (hasCodeFocus && highlightCluster === hub.clusterId);

            if (showMapClusterLabels && !hubDimmed) {
              const anchor = mapLabelAnchors.get(hub.clusterId) ?? hub.position;
              return (
                <MapClusterLabel
                  key={`${layerKey}-maplbl-${hub.clusterId}`}
                  hub={hub}
                  anchor={anchor}
                  emphasized={emphasized}
                  onSelect={
                    isLargeDataset && onEnterClusterFocus
                      ? () => onEnterClusterFocus(hub.clusterId)
                      : undefined
                  }
                />
              );
            }

            const showLabel =
              isMoveSourceHub ||
              isDropTargetHub ||
              isHovered ||
              (hasCodeFocus && highlightCluster === hub.clusterId);
            if (hubDimmed) return null;
            return (
              <ClusterLabel
                key={`${layerKey}-lbl-${hub.clusterId}`}
                hub={hub}
                dimmed={!showLabel}
                hidden={!showLabel}
                showMeta={isExpanded || isMoveSourceHub || isDropTargetHub}
              />
            );
          })}
      </group>
    );
  };

  return (
    <>
      <FocusBlendDriver
        focusClusterId={focusClusterId}
        blendRef={blendRef}
        onPhaseChange={onPhaseChange}
      />
      <FocusTransitionRig
        blendRef={blendRef}
        overviewGroupRef={overviewGroupRef}
        focusGroupRef={focusGroupRef}
        fogFar={fogFar}
        focusFogFar={focusFogFar}
      />
      <CodeDragController
        onMoveCode={onMoveCode}
        onSelectCode={onSelectCode}
        onVisualChange={onCodeDragVisualChange}
        registerBeginMoveMode={registerBeginMoveMode}
        registerCommitDrop={registerCommitDrop}
        resolveDropDestination={resolveDropDestination}
        onBeginFlight={onBeginFlight}
        flightActive={flightActive}
      />
      <BackgroundDeselect
        highlighted={highlighted}
        expandedClusterIds={expandedClusterIds}
        blendRef={blendRef}
        onClear={onClearSelection}
        onExitExpanded={() => onToggleCluster("")}
        onExitFocus={onExitFocus}
      />
      <color attach="background" args={[isDark ? "#0a0c12" : "#e8ecf4"]} />
      <fog attach="fog" args={[isDark ? "#0a0c12" : "#e8ecf4", fogFar * 0.42, fogFar]} />
      <hemisphereLight
        args={[isDark ? "#7cf0d0" : "#ffffff", isDark ? "#12081e" : "#c5d0e8", isDark ? 0.55 : 0.75]}
      />
      <ambientLight intensity={isDark ? 0.2 : 0.35} />
      <directionalLight position={[14, 18, 12]} intensity={isDark ? 0.85 : 0.65} color="#f0f4ff" />
      <pointLight position={[12, 14, 10]} intensity={isDark ? 1.35 : 0.85} color="#7cf0d0" />
      <pointLight position={[-14, -8, -12]} intensity={isDark ? 0.75 : 0.45} color="#a78bfa" />
      <Stars radius={fogFar * 1.4} depth={50} count={isDark ? 900 : 300} factor={3} fade speed={0.4} />

      <group ref={overviewGroupRef}>
        {renderLayer(overviewLayout, "ov", {
          enlarged: false,
          dimExceptClusterId: lingerFocusId,
          isFocusLayer: false,
          hubRaycastDisabled: inFocusTransition,
          transitionLayer: "overview",
        })}
      </group>

      {focusLayout && (
        <group ref={focusGroupRef}>
          {renderLayer(focusLayout, "fc", {
            enlarged: true,
            dimExceptClusterId: null,
            isFocusLayer: true,
            hubRaycastDisabled: true,
            transitionLayer: "focus",
          })}
        </group>
      )}

      {codeDragVisual.ghost && !flightActive && (
        <DragGhost
          position={codeDragVisual.ghost.position}
          color={codeDragVisual.ghost.color}
          code={codeDragVisual.ghost.code}
          origin={codeDragVisual.ghost.origin}
        />
      )}

      {moveFlight && (
        <MoveFlightGhost flight={moveFlight} onComplete={() => onFlightComplete(moveFlight)} />
      )}

      {landingBurst && <LandingBurst burst={landingBurst} />}

      <FocusTransitionCamera
        blendRef={blendRef}
        overviewDistance={overviewLayout.suggestedCameraDistance}
        focusDistance={focusLayout?.suggestedCameraDistance ?? 16}
        focusHubOverviewPos={focusHubOverviewPos}
      />
      <SceneControls
        zoomEnabled={zoomEnabled}
        cameraDistance={overviewLayout.suggestedCameraDistance}
        orbitEnabled={!inFocusTransition || focusClusterId != null}
        blendRef={blendRef}
      />
    </>
  );
}

export function CodebookCluster3D({
  sortedClusterIds,
  clusterToCodes,
  clusterColor,
  clusters,
  highlighted,
  onSelectCode,
  onClearSelection,
  onMoveCode,
  onExpandedClustersChange,
  expandedClusterIds: expandedClusterIdsProp,
  isSmallCodebook = false,
  totalClusterCount,
  isDark,
  hideChrome = false,
  focusClusterId = null,
  onExitFocus,
  onFocusTransitionPhase,
  onFocusCluster,
  onEnterClusterFocus,
  focusRemovingCode = null,
}: CodebookCluster3DProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
  const expandedClusterIds = expandedClusterIdsProp ?? internalExpanded;
  const [hoveredHubId, setHoveredHubId] = useState<string | null>(null);
  const [codeDragVisual, setCodeDragVisual] = useState<CodeDragVisual>(EMPTY_CODE_DRAG_VISUAL);
  const [moveFlight, setMoveFlight] = useState<CodeMoveFlight | null>(null);
  const [landingBurst, setLandingBurst] = useState<LandingBurstVisual | null>(null);
  const [landedCode, setLandedCode] = useState<{ code: string; clusterId: string } | null>(null);
  const blendRef = useRef(0);
  const lingerFocusIdRef = useRef<string | null>(null);
  const beginMoveModeImpl = useRef<(pending: CodeDragPending) => void>(() => {});
  const commitDropImpl = useRef<(clusterId: string) => void>(() => {});
  const codeDragDidMove = useRef(false);

  const setExpandedClusterIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const next = typeof updater === "function" ? updater(expandedClusterIds) : updater;
      if (!expandedClusterIdsProp) setInternalExpanded(next);
      onExpandedClustersChange?.([...next]);
    },
    [expandedClusterIds, expandedClusterIdsProp, onExpandedClustersChange]
  );

  const registerBeginMoveMode = useCallback((fn: (pending: CodeDragPending) => void) => {
    beginMoveModeImpl.current = fn;
  }, []);

  const registerCommitDrop = useCallback((fn: (clusterId: string) => void) => {
    commitDropImpl.current = fn;
  }, []);

  const beginMoveMode = useCallback((pending: CodeDragPending) => {
    beginMoveModeImpl.current(pending);
  }, []);

  const commitDropOnCluster = useCallback((clusterId: string) => {
    commitDropImpl.current(clusterId);
  }, []);

  const setHoverDropCluster = useCallback((clusterId: string | null) => {
    setCodeDragVisual((v) =>
      v.moveMode ? { ...v, hoverDropClusterId: clusterId } : v
    );
  }, []);

  useEffect(() => {
    if (focusClusterId) lingerFocusIdRef.current = focusClusterId;
  }, [focusClusterId]);

  const handlePhaseChange = useCallback(
    (phase: FocusTransitionPhase) => {
      onFocusTransitionPhase?.(phase);
      if (phase === "idle" && !focusClusterId) {
        lingerFocusIdRef.current = null;
      }
    },
    [focusClusterId, onFocusTransitionPhase]
  );

  const lingerFocusId = focusClusterId ?? lingerFocusIdRef.current;

  const overviewLayout = useMemo(
    () =>
      buildCodebook3DLayout(sortedClusterIds, clusterToCodes, clusterColor, clusters, {
        expandedClusterIds: isSmallCodebook ? undefined : Array.from(expandedClusterIds),
        forceShowAllCodes: isSmallCodebook,
        totalClusterCount,
      }),
    [sortedClusterIds, clusterToCodes, clusterColor, clusters, expandedClusterIds, isSmallCodebook, totalClusterCount]
  );

  const focusLayout = useMemo(() => {
    if (!lingerFocusId) return null;
    return buildFocusedCluster3DLayout(
      lingerFocusId,
      clusterToCodes,
      clusterColor,
      clusters
    );
  }, [lingerFocusId, clusterToCodes, clusterColor, clusters]);

  const resolveDropDestination = useCallback(
    (toClusterId: string): [number, number, number] => {
      const layout =
        blendRef.current > 0.65 && focusLayout ? focusLayout : overviewLayout;
      const hub = layout.hubs.find((h) => h.clusterId === toClusterId);
      if (!hub) return [0, 0, 0];
      const count = (clusterToCodes[toClusterId]?.length ?? 0) + 1;
      return estimateAppendCodePosition(
        hub.position,
        count,
        Math.max(1, expandedClusterIds.size)
      );
    },
    [focusLayout, overviewLayout, clusterToCodes, expandedClusterIds.size]
  );

  const handleBeginFlight = useCallback((flight: Omit<CodeMoveFlight, "startTime">) => {
    setMoveFlight({ ...flight, startTime: performance.now() });
  }, []);

  const handleFlightComplete = useCallback(
    (flight: CodeMoveFlight) => {
      setLandingBurst({
        position: flight.to,
        color: flight.color,
        startTime: performance.now(),
      });
      onMoveCode?.(flight.code, flight.fromClusterId, flight.toClusterId);
      setLandedCode({ code: flight.code, clusterId: flight.toClusterId });
      setMoveFlight(null);
    },
    [onMoveCode]
  );

  useEffect(() => {
    if (!landedCode) return;
    const timer = window.setTimeout(() => setLandedCode(null), LANDING_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [landedCode]);

  useEffect(() => {
    if (!landingBurst) return;
    const timer = window.setTimeout(() => setLandingBurst(null), 700);
    return () => window.clearTimeout(timer);
  }, [landingBurst]);

  const overviewMode =
    !focusClusterId &&
    !lingerFocusId &&
    overviewLayout.isLargeDataset &&
    !isSmallCodebook &&
    expandedClusterIds.size === 0;

  const syncExpanded = useCallback(
    (next: Set<string>) => {
      setExpandedClusterIds(next);
    },
    [setExpandedClusterIds]
  );

  const handleToggleCluster = useCallback(
    (clusterId: string) => {
      if (!clusterId) {
        syncExpanded(new Set());
        onClearSelection();
        return;
      }
      setExpandedClusterIds((prev) => {
        const next = new Set(prev);
        if (next.has(clusterId)) next.delete(clusterId);
        else next.add(clusterId);
        return next;
      });
    },
    [onClearSelection, setExpandedClusterIds, syncExpanded]
  );

  useEffect(() => {
    if (isSmallCodebook || !overviewLayout.isLargeDataset || !highlighted || focusClusterId) return;
    setExpandedClusterIds((prev) => {
      if (prev.has(highlighted.clusterId)) return prev;
      return new Set(prev).add(highlighted.clusterId);
    });
  }, [isSmallCodebook, overviewLayout.isLargeDataset, highlighted, focusClusterId, setExpandedClusterIds]);

  useEffect(() => {
    if (!expandedClusterIdsProp) {
      setInternalExpanded(new Set());
    }
    setHoveredHubId(null);
    setCodeDragVisual(EMPTY_CODE_DRAG_VISUAL);
    setMoveFlight(null);
    setLandingBurst(null);
    setLandedCode(null);
    blendRef.current = 0;
    lingerFocusIdRef.current = null;
  }, [sortedClusterIds.join("|"), isSmallCodebook, expandedClusterIdsProp]);

  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [cursorMode, setCursorMode] = useState<Codebook3DCursorMode>("orbit");
  const dragging = useRef(false);
  const cursors = useMemo(() => codebook3dCursors(isDark), [isDark]);
  const activeCursor = cursors[cursorMode];

  const setMode = useCallback((mode: Codebook3DCursorMode) => {
    setCursorMode(mode);
  }, []);

  const cursorContextValue = useMemo(
    () => ({
      setMode,
      dragging,
      beginMoveMode,
      commitDropOnCluster,
      setHoverDropCluster,
      codeDragVisual,
      codeDragDidMove,
    }),
    [setMode, beginMoveMode, commitDropOnCluster, setHoverDropCluster, codeDragVisual]
  );

  useEffect(() => {
    const onPointerUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setCursorMode("orbit");
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, []);

  if (overviewLayout.hubs.length === 0) {
    return (
      <div className="codebook-graph-empty glass-panel">
        <p className="library-empty-body">No codes to visualize yet.</p>
      </div>
    );
  }

  const canvas = (
    <Codebook3DCursorContext.Provider value={cursorContextValue}>
      <div
        className="codebook-3d-canvas-host"
        style={{ cursor: activeCursor }}
        onPointerEnter={() => setZoomEnabled(true)}
        onPointerLeave={() => {
          setZoomEnabled(false);
          if (!codeDragVisual.moveMode) {
            dragging.current = false;
            setCursorMode("orbit");
          }
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
          setCursorMode("grabbing");
        }}
      >
        {codeDragVisual.moveMode && (
          <div className="codebook-3d-move-banner" role="status">
            <span className="codebook-3d-move-banner-title">Moving code</span>
            <span className="codebook-3d-move-banner-sub">
              Hover a destination cluster (any node lights it up) · double-click there to drop · Esc to cancel
            </span>
          </div>
        )}
        {moveFlight && (
          <div className="codebook-3d-move-banner codebook-3d-move-banner--flight" role="status">
            <span className="codebook-3d-move-banner-title">Transferring code</span>
            <span className="codebook-3d-move-banner-sub">{truncateLabel(moveFlight.code, 40)}</span>
          </div>
        )}
        <Canvas
          className="codebook-3d-canvas"
          frameloop="demand"
          camera={{ position: [0, 0, INITIAL_CAMERA_DISTANCE], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = isDark ? 1.2 : 1.05;
          }}
          style={{ width: "100%", height: "100%", touchAction: "none", cursor: activeCursor }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <FocusBlendRefContext.Provider value={blendRef}>
            <Scene
              overviewLayout={overviewLayout}
              focusLayout={focusLayout}
              blendRef={blendRef}
              lingerFocusId={lingerFocusId}
              focusClusterId={focusClusterId}
              highlighted={highlighted}
              expandedClusterIds={expandedClusterIds}
              hoveredHubId={hoveredHubId}
              forceShowAllCodes={isSmallCodebook}
              codeDragVisual={codeDragVisual}
              onSelectCode={onSelectCode}
              onClearSelection={onClearSelection}
              onToggleCluster={handleToggleCluster}
              onHoverHub={setHoveredHubId}
              onMoveCode={onMoveCode}
              onCodeDragVisualChange={setCodeDragVisual}
              registerBeginMoveMode={registerBeginMoveMode}
              registerCommitDrop={registerCommitDrop}
              resolveDropDestination={resolveDropDestination}
              onBeginFlight={handleBeginFlight}
              onFlightComplete={handleFlightComplete}
              moveFlight={moveFlight}
              landingBurst={landingBurst}
              landedCode={landedCode}
              onExitFocus={onExitFocus}
              onPhaseChange={handlePhaseChange}
              onFocusCluster={onFocusCluster}
              onEnterClusterFocus={onEnterClusterFocus}
              focusRemovingCode={focusRemovingCode}
              isDark={isDark}
              zoomEnabled={zoomEnabled}
            />
          </FocusBlendRefContext.Provider>
        </Canvas>
      </div>
    </Codebook3DCursorContext.Provider>
  );

  if (hideChrome) return canvas;

  return (
    <div className="codebook-3d-canvas-wrap glass-panel">
      <div className="codebook-3d-canvas-head">
        <h4>3D cluster map</h4>
        {overviewMode ? (
          <span className="library-panel-sub">
            {overviewLayout.clusterCount} clusters · click a cluster or label to focus · scroll to zoom
          </span>
        ) : expandedClusterIds.size > 0 && !isSmallCodebook ? (
          <div className="codebook-3d-canvas-head-row">
            <button
              type="button"
              className="library-mini-btn codebook-3d-back-btn"
              onClick={() => handleToggleCluster("")}
            >
              ← Overview
            </button>
            <span className="library-panel-sub">
              {expandedClusterIds.size} cluster{expandedClusterIds.size === 1 ? "" : "s"} expanded · click
              another sphere to add more · drag codes between clusters · click an expanded sphere again to collapse
            </span>
          </div>
        ) : (
          <span className="library-panel-sub">
            Scroll to zoom · drag to orbit · double-click a code to pick up · double-click a destination cluster to drop
          </span>
        )}
      </div>
      {canvas}
      {highlighted && (
        <div className="codebook-3d-selection-bar">
          <span
            className="codebook-3d-selection-pill"
            style={{
              ["--cluster-color" as string]: clusterColor.get(highlighted.clusterId) ?? "#7cf0d0",
            }}
          >
            {highlighted.code}
          </span>
          <span className="library-panel-sub">
            Selected — drag onto another cluster in the map or on the board below to move
          </span>
        </div>
      )}
    </div>
  );
}

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
  type CodeNode3D,
  type ClusterHub3D,
} from "../lib/codebookClusterLayout3d";
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

interface CodeDragVisual {
  sourceKey: string | null;
  dropTargetClusterId: string | null;
  ghost: { position: [number, number, number]; color: string } | null;
}

interface Codebook3DCursorContextValue {
  setMode: (mode: Codebook3DCursorMode) => void;
  dragging: MutableRefObject<boolean>;
  beginCodeDrag: (pending: CodeDragPending) => void;
  codeDragVisual: CodeDragVisual;
  codeDragDidMove: MutableRefObject<boolean>;
}

const CLICK_DRAG_THRESHOLD_PX = 6;

const EMPTY_CODE_DRAG_VISUAL: CodeDragVisual = {
  sourceKey: null,
  dropTargetClusterId: null,
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

function CodeSphere({
  node,
  highlighted,
  dimmed,
  hiddenByDrag,
  onSelect,
}: {
  node: CodeNode3D;
  highlighted: boolean;
  dimmed: boolean;
  hiddenByDrag: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const hoveredRef = useRef(false);
  const { setMode, dragging, beginCodeDrag, codeDragVisual, codeDragDidMove } = useCodebook3DCursor();
  const color = useMemo(() => hexToThree(node.color), [node.color]);

  useLayoutEffect(() => {
    disableRaycast(glowRef.current);
    disableRaycast(coreRef.current);
    disableRaycast(ringRef.current);
  }, []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = materialRef.current;
    if (!mesh || !mat) return;

    const pulse = highlighted ? 1.55 + Math.sin(state.clock.elapsedTime * 5) * 0.1 : 1;
    const hover = hoveredRef.current ? 1.18 : 1;
    const target = pulse * hover;
    mesh.scale.lerp(new THREE.Vector3(target, target, target), delta * 10);

    const glow = glowRef.current;
    if (glow) glow.scale.setScalar(target * 1.45);

    const baseEmissive = dimmed ? 0.18 : highlighted ? 0.95 : hoveredRef.current ? 0.62 : 0.42;
    mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, baseEmissive, delta * 8);
    mat.opacity = dimmed ? 0.55 : 1;

    const ring = ringRef.current;
    if (ring) {
      const showRing = highlighted || hoveredRef.current;
      ring.visible = showRing;
      if (showRing) ring.scale.setScalar(highlighted ? 1.75 : 1.45);
    }
  });

  return (
    <group ref={groupRef} position={node.position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={dimmed ? 0.04 : 0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh
        ref={meshRef}
        visible={!hiddenByDrag}
        userData={{ codebookNode: true, clusterId: node.clusterId, code: node.code }}
        onClick={(e) => {
          e.stopPropagation();
          if (codeDragDidMove.current) return;
          onSelect();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          codeDragDidMove.current = false;
          beginCodeDrag({
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
          if (!dragging.current && !codeDragVisual.ghost) setMode("node");
        }}
        onPointerOut={() => {
          hoveredRef.current = false;
          if (!dragging.current && !codeDragVisual.ghost) setMode("orbit");
        }}
      >
        <sphereGeometry args={[0.28, 32, 32]} />
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
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={highlighted ? 0.55 : dimmed ? 0.08 : 0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={ringRef} visible={false} scale={1.45}>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.22}
          wireframe
          depthWrite={false}
        />
      </mesh>

      {highlighted && (
        <Html
          transform={false}
          center
          position={[0, 1.05, 0]}
          zIndexRange={[200, 100]}
          wrapperClass="codebook-3d-html-wrap"
          style={{ pointerEvents: "none" }}
        >
          <div
            className="codebook-3d-code-label"
            style={{ ["--cluster-color" as string]: node.color }}
            title={node.code}
          >
            {node.code}
          </div>
        </Html>
      )}
    </group>
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
    hub.position[1] + 2.2,
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
/** Below this ratio of base camera distance, overview labels appear near the orbit target. */
const ZOOM_LABEL_THRESHOLD = 0.82;

const _hubPos = new THREE.Vector3();
const _orbitTarget = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/** Tracks which cluster hubs are near the orbit focus while zoomed in (overview mode). */
function ZoomLabelProbe({
  hubs,
  layoutRadius,
  baseCameraDistance,
  enabled,
  onVisibleHubsChange,
}: {
  hubs: ClusterHub3D[];
  layoutRadius: number;
  baseCameraDistance: number;
  enabled: boolean;
  onVisibleHubsChange: (ids: Set<string>) => void;
}) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const lastKey = useRef("");

  useFrame(() => {
    if (!enabled) {
      if (lastKey.current !== "off") {
        lastKey.current = "off";
        onVisibleHubsChange(new Set());
      }
      return;
    }

    const target = controls?.target ?? _orbitTarget.set(0, 0, 0);
    const camDist = camera.position.distanceTo(target);
    const zoomRatio = camDist / baseCameraDistance;

    if (zoomRatio > ZOOM_LABEL_THRESHOLD) {
      if (lastKey.current !== "far") {
        lastKey.current = "far";
        onVisibleHubsChange(new Set());
      }
      return;
    }

    const revealRadius = layoutRadius * Math.max(0.22, zoomRatio * 0.95);
    const visible = new Set<string>();

    for (const hub of hubs) {
      _hubPos.set(hub.position[0], hub.position[1], hub.position[2]);
      if (_hubPos.distanceTo(target) > revealRadius) continue;

      _ndc.copy(_hubPos).project(camera);
      if (_ndc.x < -1.05 || _ndc.x > 1.05 || _ndc.y < -1.05 || _ndc.y > 1.05 || _ndc.z > 1) continue;

      visible.add(hub.clusterId);
    }

    const key = [...visible].sort().join(",");
    if (key !== lastKey.current) {
      lastKey.current = key;
      onVisibleHubsChange(visible);
    }
  });

  return null;
}

function SceneControls({
  zoomEnabled,
  cameraDistance,
}: {
  zoomEnabled: boolean;
  cameraDistance: number;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const didInit = useRef(false);
  const lastDistance = useRef(cameraDistance);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
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
    if (controls) controls.enableZoom = zoomEnabled;
  }, [zoomEnabled]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0, 0]}
      enablePan
      enableZoom={zoomEnabled}
      enableRotate
      minDistance={6}
      maxDistance={55}
      dampingFactor={0.08}
      enableDamping
    />
  );
}

/** Clear selection / exit expanded clusters on click-release over empty map space. */
function BackgroundDeselect({
  highlighted,
  expandedClusterIds,
  onClear,
  onExitExpanded,
}: {
  highlighted: HighlightedCode | null;
  expandedClusterIds: Set<string>;
  onClear: () => void;
  onExitExpanded: () => void;
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
      if (codeDragVisual.ghost || codeDragDidMove.current) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) return;

      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      const hits = raycaster.intersectObjects(scene.children, true);
      const hitInteractive = hits.some(
        (hit) => hit.object.userData?.codebookNode === true || hit.object.userData?.codebookHub === true
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
    onClear,
    onExitExpanded,
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

function readDropClusterId(hit: THREE.Intersection): string | null {
  const data = hit.object.userData;
  if (typeof data?.clusterId === "string") return data.clusterId;
  return null;
}

function CodeDragController({
  hubs,
  onMoveCode,
  onSelectCode,
  onVisualChange,
  registerBeginCodeDrag,
}: {
  hubs: ClusterHub3D[];
  onMoveCode?: (code: string, fromClusterId: string, toClusterId: string) => void;
  onSelectCode: (code: string, clusterId: string) => void;
  onVisualChange: (visual: CodeDragVisual) => void;
  registerBeginCodeDrag: (fn: (pending: CodeDragPending) => void) => void;
}) {
  const { camera, gl, scene } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const { setMode, dragging: orbitDragging, codeDragDidMove } = useCodebook3DCursor();
  const pendingRef = useRef<CodeDragPending | null>(null);
  const activeRef = useRef<(CodeDragPending & { ghostPosition: THREE.Vector3 }) | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const planeHit = useMemo(() => new THREE.Vector3(), []);
  const cameraDir = useMemo(() => new THREE.Vector3(), []);

  const clientToNdc = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return ndc;
    },
    [gl, ndc]
  );

  const findDropTarget = useCallback(
    (clientX: number, clientY: number, fromClusterId: string): string | null => {
      raycaster.setFromCamera(clientToNdc(clientX, clientY), camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const clusterId = readDropClusterId(hit);
        if (clusterId && clusterId !== fromClusterId) return clusterId;
      }

      raycaster.ray.at(12, planeHit);
      let nearest: { id: string; d: number } | null = null;
      for (const hub of hubs) {
        if (hub.clusterId === fromClusterId) continue;
        const dx = hub.position[0] - planeHit.x;
        const dy = hub.position[1] - planeHit.y;
        const dz = hub.position[2] - planeHit.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (!nearest || d < nearest.d) nearest = { id: hub.clusterId, d };
      }
      if (nearest && nearest.d < 9) return nearest.id;
      return null;
    },
    [camera, clientToNdc, hubs, planeHit, raycaster, scene]
  );

  const updateGhostPosition = useCallback(
    (clientX: number, clientY: number, origin: [number, number, number], ghost: THREE.Vector3) => {
      camera.getWorldDirection(cameraDir);
      dragPlane.setFromNormalAndCoplanarPoint(cameraDir, new THREE.Vector3(...origin));
      raycaster.setFromCamera(clientToNdc(clientX, clientY), camera);
      if (raycaster.ray.intersectPlane(dragPlane, ghost)) return;
      ghost.set(...origin);
    },
    [camera, cameraDir, clientToNdc, dragPlane, raycaster]
  );

  useEffect(() => {
    registerBeginCodeDrag((pending: CodeDragPending) => {
      pendingRef.current = pending;
      activeRef.current = null;
      codeDragDidMove.current = false;
    });
  }, [codeDragDidMove, registerBeginCodeDrag]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;

      if (pending && !activeRef.current) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (Math.hypot(dx, dy) < CLICK_DRAG_THRESHOLD_PX) return;
        if (!onMoveCode) {
          pendingRef.current = null;
          return;
        }
        activeRef.current = {
          ...pending,
          ghostPosition: new THREE.Vector3(...pending.originPosition),
        };
        pendingRef.current = null;
        orbitDragging.current = false;
        codeDragDidMove.current = true;
        onSelectCode(pending.code, pending.fromClusterId);
        if (controls) controls.enabled = false;
        setMode("grabbing");
      }

      const drag = activeRef.current;
      if (!drag) return;

      updateGhostPosition(e.clientX, e.clientY, drag.originPosition, drag.ghostPosition);
      const dropTargetClusterId = findDropTarget(e.clientX, e.clientY, drag.fromClusterId);
      onVisualChange({
        sourceKey: `${drag.fromClusterId}:${drag.code}`,
        dropTargetClusterId,
        ghost: {
          position: [drag.ghostPosition.x, drag.ghostPosition.y, drag.ghostPosition.z],
          color: drag.color,
        },
      });
    };

    const finishDrag = (clientX: number, clientY: number) => {
      const drag = activeRef.current;
      pendingRef.current = null;
      activeRef.current = null;
      onVisualChange(EMPTY_CODE_DRAG_VISUAL);

      if (drag && onMoveCode) {
        const target = findDropTarget(clientX, clientY, drag.fromClusterId);
        if (target) onMoveCode(drag.code, drag.fromClusterId, target);
      }

      if (controls) controls.enabled = true;
      setMode("orbit");
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activeRef.current) finishDrag(e.clientX, e.clientY);
      else pendingRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    codeDragDidMove,
    controls,
    findDropTarget,
    onMoveCode,
    onSelectCode,
    onVisualChange,
    orbitDragging,
    setMode,
    updateGhostPosition,
  ]);

  return null;
}

function DragGhost({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  const threeColor = useMemo(() => hexToThree(color), [color]);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const pulse = 1.1 + Math.sin(state.clock.elapsedTime * 8) * 0.06;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.34, 28, 28]} />
        <meshPhysicalMaterial
          color={threeColor}
          emissive={threeColor}
          emissiveIntensity={0.9}
          roughness={0.18}
          metalness={0.55}
          clearcoat={0.95}
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ClusterEdge({
  a,
  b,
  color,
  opacity,
  lineWidth,
}: {
  a: [number, number, number];
  b: [number, number, number];
  color: string;
  opacity: number;
  lineWidth: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    groupRef.current?.traverse((obj) => {
      obj.raycast = () => undefined;
    });
  }, []);

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
  acceptCodeDrop,
  onFocus,
  onHoverChange,
}: {
  hub: ClusterHub3D;
  active: boolean;
  pickable?: boolean;
  isDropTarget?: boolean;
  acceptCodeDrop?: boolean;
  onFocus?: () => void;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const color = useMemo(() => hexToThree(hub.color), [hub.color]);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const { setMode, dragging, codeDragVisual } = useCodebook3DCursor();
  const acceptDrops = pickable || isDropTarget || acceptCodeDrop;
  const hubRadius = acceptDrops ? Math.min(0.95, 0.42 + Math.sqrt(hub.codeCount) * 0.06) : 0.1;

  useLayoutEffect(() => {
    if (acceptDrops) return;
    disableRaycast(coreRef.current);
    disableRaycast(ringRef.current);
  }, [acceptDrops]);

  useFrame((state) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z = state.clock.elapsedTime * (isDropTarget ? 0.85 : 0.35);
    if (coreRef.current) {
      const pulse = isDropTarget ? 1.12 + Math.sin(state.clock.elapsedTime * 6) * 0.08 : 1;
      coreRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={hub.position}>
      <mesh
        ref={coreRef}
        userData={acceptDrops ? { codebookHub: true, clusterId: hub.clusterId } : undefined}
        onClick={
          pickable
            ? (e) => {
                e.stopPropagation();
                onFocus?.();
              }
            : undefined
        }
        onPointerOver={
          acceptDrops
            ? (e) => {
                e.stopPropagation();
                onHoverChange?.(true);
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
          emissiveIntensity={isDropTarget ? 1.05 : active ? 0.85 : pickable ? 0.5 : 0.2}
          roughness={0.25}
          metalness={0.45}
          clearcoat={0.75}
          transparent={!acceptDrops}
          opacity={acceptDrops ? 1 : active ? 0.95 : 0.45}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[hubRadius * 1.35, acceptDrops ? 0.045 : 0.028, 10, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isDropTarget ? 0.9 : active ? 0.65 : pickable ? 0.35 : 0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Scene({
  layout,
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
  registerBeginCodeDrag,
  isDark,
  zoomEnabled,
}: {
  layout: ReturnType<typeof buildCodebook3DLayout>;
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
  registerBeginCodeDrag: (fn: (pending: CodeDragPending) => void) => void;
  isDark: boolean;
  zoomEnabled: boolean;
}) {
  const { nodes, hubs, edges, isLargeDataset, suggestedCameraDistance: camDist } = layout;
  const highlightCluster = highlighted?.clusterId ?? null;
  const hasCodeFocus = highlighted != null;
  const overviewMode = isLargeDataset && !forceShowAllCodes && expandedClusterIds.size === 0;
  const fogFar = Math.max(58, layout.layoutRadius * 2.8);
  const [zoomLabelHubIds, setZoomLabelHubIds] = useState<Set<string>>(() => new Set());
  const isCodeDragging = codeDragVisual.ghost != null;

  useEffect(() => {
    if (!overviewMode) setZoomLabelHubIds(new Set());
  }, [overviewMode]);

  return (
    <>
      <CodeDragController
        hubs={hubs}
        onMoveCode={onMoveCode}
        onSelectCode={onSelectCode}
        onVisualChange={onCodeDragVisualChange}
        registerBeginCodeDrag={registerBeginCodeDrag}
      />
      {overviewMode && (
        <ZoomLabelProbe
          hubs={hubs}
          layoutRadius={layout.layoutRadius}
          baseCameraDistance={camDist}
          enabled={overviewMode}
          onVisibleHubsChange={setZoomLabelHubIds}
        />
      )}
      <BackgroundDeselect
        highlighted={highlighted}
        expandedClusterIds={expandedClusterIds}
        onClear={onClearSelection}
        onExitExpanded={() => onToggleCluster("")}
      />
      <color attach="background" args={[isDark ? "#0a0c12" : "#e8ecf4"]} />
      <fog attach="fog" args={[isDark ? "#0a0c12" : "#e8ecf4", fogFar * 0.45, fogFar]} />
      <hemisphereLight
        args={[isDark ? "#7cf0d0" : "#ffffff", isDark ? "#12081e" : "#c5d0e8", isDark ? 0.55 : 0.75]}
      />
      <ambientLight intensity={isDark ? 0.2 : 0.35} />
      <directionalLight position={[14, 18, 12]} intensity={isDark ? 0.85 : 0.65} color="#f0f4ff" />
      <pointLight position={[12, 14, 10]} intensity={isDark ? 1.35 : 0.85} color="#7cf0d0" />
      <pointLight position={[-14, -8, -12]} intensity={isDark ? 0.75 : 0.45} color="#a78bfa" />
      <Stars radius={fogFar * 1.4} depth={50} count={isDark ? 900 : 300} factor={3} fade speed={0.4} />

      {!overviewMode &&
        edges.map(([a, b], i) => {
          const clusterId = nodes[a].clusterId;
          const edgeActive = !hasCodeFocus || clusterId === highlightCluster;
          return (
            <ClusterEdge
              key={`e-${i}`}
              a={nodes[a].position}
              b={nodes[b].position}
              color={nodes[a].color}
              opacity={edgeActive ? (highlighted ? 0.5 : 0.32) : 0.08}
              lineWidth={edgeActive ? 1.5 : 1}
            />
          );
        })}

      {hubs.map((hub) => {
        const isExpanded = expandedClusterIds.has(hub.clusterId);
        const showPickable = !forceShowAllCodes && (overviewMode || (isLargeDataset && !isExpanded));
        const isDropTarget =
          isCodeDragging && codeDragVisual.dropTargetClusterId === hub.clusterId;
        return (
          <ClusterHub
            key={`hub-${hub.clusterId}`}
            hub={hub}
            active={isExpanded || (hasCodeFocus && highlightCluster === hub.clusterId)}
            pickable={showPickable || (isLargeDataset && isExpanded)}
            isDropTarget={isDropTarget}
            acceptCodeDrop={isCodeDragging}
            onFocus={() => onToggleCluster(hub.clusterId)}
            onHoverChange={(hovered) => onHoverHub(hovered ? hub.clusterId : null)}
          />
        );
      })}

      {!overviewMode &&
        nodes.map((node) => {
          const nodeKey = `${node.clusterId}:${node.code}`;
          const isHighlighted =
            highlighted?.code === node.code && highlighted.clusterId === node.clusterId;
          const dimmed = hasCodeFocus && node.clusterId !== highlightCluster && !isHighlighted;
          const hiddenByDrag = codeDragVisual.sourceKey === nodeKey;
          return (
            <CodeSphere
              key={nodeKey}
              node={node}
              highlighted={isHighlighted}
              dimmed={dimmed}
              hiddenByDrag={hiddenByDrag}
              onSelect={() => onSelectCode(node.code, node.clusterId)}
            />
          );
        })}

      {codeDragVisual.ghost && (
        <DragGhost position={codeDragVisual.ghost.position} color={codeDragVisual.ghost.color} />
      )}

      {hubs.map((hub) => {
        const isExpanded = expandedClusterIds.has(hub.clusterId);
        const isHovered = hoveredHubId === hub.clusterId;
        const zoomFocused = zoomLabelHubIds.has(hub.clusterId);
        const showLabel = overviewMode
          ? isHovered || zoomFocused
          : isExpanded || isHovered || (hasCodeFocus && highlightCluster === hub.clusterId);
        return (
          <ClusterLabel
            key={`lbl-${hub.clusterId}`}
            hub={hub}
            dimmed={overviewMode ? !isHovered && !zoomFocused : !showLabel && expandedClusterIds.size > 0 && !isExpanded}
            hidden={!showLabel}
            showMeta={overviewMode || isExpanded}
          />
        );
      })}

      <SceneControls zoomEnabled={zoomEnabled} cameraDistance={camDist} />
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
}: CodebookCluster3DProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
  const expandedClusterIds = expandedClusterIdsProp ?? internalExpanded;
  const [hoveredHubId, setHoveredHubId] = useState<string | null>(null);
  const [codeDragVisual, setCodeDragVisual] = useState<CodeDragVisual>(EMPTY_CODE_DRAG_VISUAL);
  const beginCodeDragImpl = useRef<(pending: CodeDragPending) => void>(() => {});
  const codeDragDidMove = useRef(false);

  const setExpandedClusterIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const next = typeof updater === "function" ? updater(expandedClusterIds) : updater;
      if (!expandedClusterIdsProp) setInternalExpanded(next);
      onExpandedClustersChange?.([...next]);
    },
    [expandedClusterIds, expandedClusterIdsProp, onExpandedClustersChange]
  );

  const registerBeginCodeDrag = useCallback((fn: (pending: CodeDragPending) => void) => {
    beginCodeDragImpl.current = fn;
  }, []);

  const beginCodeDrag = useCallback((pending: CodeDragPending) => {
    beginCodeDragImpl.current(pending);
  }, []);

  const layout = useMemo(
    () =>
      buildCodebook3DLayout(sortedClusterIds, clusterToCodes, clusterColor, clusters, {
        expandedClusterIds: isSmallCodebook ? undefined : Array.from(expandedClusterIds),
        forceShowAllCodes: isSmallCodebook,
        totalClusterCount,
      }),
    [sortedClusterIds, clusterToCodes, clusterColor, clusters, expandedClusterIds, isSmallCodebook, totalClusterCount]
  );

  const overviewMode = layout.isLargeDataset && !isSmallCodebook && expandedClusterIds.size === 0;

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
    if (isSmallCodebook || !layout.isLargeDataset || !highlighted) return;
    setExpandedClusterIds((prev) => {
      if (prev.has(highlighted.clusterId)) return prev;
      return new Set(prev).add(highlighted.clusterId);
    });
  }, [isSmallCodebook, layout.isLargeDataset, highlighted, setExpandedClusterIds]);

  useEffect(() => {
    if (!expandedClusterIdsProp) {
      setInternalExpanded(new Set());
    }
    setHoveredHubId(null);
    setCodeDragVisual(EMPTY_CODE_DRAG_VISUAL);
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
      beginCodeDrag,
      codeDragVisual,
      codeDragDidMove,
    }),
    [setMode, beginCodeDrag, codeDragVisual]
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

  if (layout.hubs.length === 0) {
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
          dragging.current = false;
          setCursorMode("orbit");
        }}
        onPointerDown={(e) => {
          if (codeDragVisual.ghost) return;
          e.stopPropagation();
          dragging.current = true;
          setCursorMode("grabbing");
        }}
      >
        <Canvas
          className="codebook-3d-canvas"
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
          <Scene
            layout={layout}
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
            registerBeginCodeDrag={registerBeginCodeDrag}
            isDark={isDark}
            zoomEnabled={zoomEnabled}
          />
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
            {layout.clusterCount} clusters · hover to preview · scroll to zoom in for labels · click to expand codes
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
            Scroll over the map to zoom · drag to orbit · click a code node · drag a code onto another cluster to move it
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

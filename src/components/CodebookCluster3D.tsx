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

interface Codebook3DCursorContextValue {
  setMode: (mode: Codebook3DCursorMode) => void;
  dragging: MutableRefObject<boolean>;
  controlsActive: MutableRefObject<boolean>;
}

const Codebook3DCursorContext = createContext<Codebook3DCursorContextValue | null>(null);

function useCodebook3DCursor() {
  const ctx = useContext(Codebook3DCursorContext);
  if (!ctx) throw new Error("useCodebook3DCursor must be used inside CodebookCluster3D");
  return ctx;
}

export interface HighlightedCode {
  code: string;
  clusterId: string;
}

interface CodebookCluster3DProps {
  sortedClusterIds: string[];
  clusterToCodes: Record<string, string[]>;
  clusterColor: Map<string, string>;
  clusters: Record<string, ClusterEntry>;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  onClearSelection: () => void;
  isDark: boolean;
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
  onSelect,
}: {
  node: CodeNode3D;
  highlighted: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const hoveredRef = useRef(false);
  const { setMode, dragging } = useCodebook3DCursor();
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
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoveredRef.current = true;
          if (!dragging.current) setMode("node");
        }}
        onPointerOut={() => {
          hoveredRef.current = false;
          if (!dragging.current) setMode("orbit");
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
}: {
  hub: ClusterHub3D;
  dimmed: boolean;
  hidden: boolean;
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
        <span className="codebook-3d-label-name">{truncateLabel(hub.label)}</span>
        <span className="codebook-3d-label-meta">
          #{hub.clusterId} · {hub.confidence}/5
        </span>
      </div>
    </Html>
  );
}

const INITIAL_CAMERA_DISTANCE = 32;

function SceneControls({ zoomEnabled }: { zoomEnabled: boolean }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const { controlsActive } = useCodebook3DCursor();
  const didInit = useRef(false);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || didInit.current) return;
    camera.position.set(0, 0, INITIAL_CAMERA_DISTANCE);
    controls.target.set(0, 0, 0);
    controls.update();
    didInit.current = true;
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
      onStart={() => {
        controlsActive.current = true;
      }}
      onEnd={() => {
        window.setTimeout(() => {
          controlsActive.current = false;
        }, 0);
      }}
    />
  );
}

function ClusterHub({ hub, active }: { hub: ClusterHub3D; active: boolean }) {
  const color = useMemo(() => hexToThree(hub.color), [hub.color]);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    disableRaycast(coreRef.current);
    disableRaycast(ringRef.current);
  }, []);

  useFrame((state) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z = state.clock.elapsedTime * 0.35;
  });

  return (
    <group position={hub.position}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.45} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.028, 10, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 0.55 : 0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function SceneBackdrop({ onClear }: { onClear: () => void }) {
  return (
    <mesh
      scale={90}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
    >
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial visible={false} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

function Scene({
  layout,
  highlighted,
  onSelectCode,
  onClearSelection,
  isDark,
  zoomEnabled,
}: {
  layout: ReturnType<typeof buildCodebook3DLayout>;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  onClearSelection: () => void;
  isDark: boolean;
  zoomEnabled: boolean;
}) {
  const { nodes, hubs, edges } = layout;
  const { dragging, controlsActive } = useCodebook3DCursor();
  const highlightCluster = highlighted?.clusterId ?? null;
  const hasFocus = highlightCluster != null;

  const clearIfSelected = useCallback(() => {
    if (dragging.current || controlsActive.current || !highlighted) return;
    onClearSelection();
  }, [dragging, controlsActive, highlighted, onClearSelection]);

  return (
    <>
      <SceneBackdrop onClear={clearIfSelected} />
      <color attach="background" args={[isDark ? "#0a0c12" : "#e8ecf4"]} />
      <fog attach="fog" args={[isDark ? "#0a0c12" : "#e8ecf4", 30, 58]} />
      <hemisphereLight
        args={[isDark ? "#7cf0d0" : "#ffffff", isDark ? "#12081e" : "#c5d0e8", isDark ? 0.55 : 0.75]}
      />
      <ambientLight intensity={isDark ? 0.2 : 0.35} />
      <directionalLight position={[14, 18, 12]} intensity={isDark ? 0.85 : 0.65} color="#f0f4ff" />
      <pointLight position={[12, 14, 10]} intensity={isDark ? 1.35 : 0.85} color="#7cf0d0" />
      <pointLight position={[-14, -8, -12]} intensity={isDark ? 0.75 : 0.45} color="#a78bfa" />
      <Stars radius={80} depth={40} count={isDark ? 1200 : 400} factor={3} fade speed={0.4} />

      {edges.map(([a, b], i) => {
        const clusterId = nodes[a].clusterId;
        const edgeActive = !hasFocus || clusterId === highlightCluster;
        return (
          <Line
            key={`e-${i}`}
            points={[nodes[a].position, nodes[b].position]}
            color={nodes[a].color}
            transparent
            opacity={edgeActive ? (highlighted ? 0.5 : 0.32) : 0.08}
            lineWidth={edgeActive ? 1.5 : 1}
          />
        );
      })}

      {hubs.map((hub) => (
        <ClusterHub
          key={`hub-${hub.clusterId}`}
          hub={hub}
          active={highlightCluster === hub.clusterId}
        />
      ))}

      {nodes.map((node) => {
        const isHighlighted =
          highlighted?.code === node.code && highlighted.clusterId === node.clusterId;
        const dimmed = hasFocus && node.clusterId !== highlightCluster && !isHighlighted;
        return (
          <CodeSphere
            key={`${node.clusterId}:${node.code}`}
            node={node}
            highlighted={isHighlighted}
            dimmed={dimmed}
            onSelect={() => onSelectCode(node.code, node.clusterId)}
          />
        );
      })}

      {hubs.map((hub) => (
        <ClusterLabel
          key={`lbl-${hub.clusterId}`}
          hub={hub}
          dimmed={highlightCluster != null && highlightCluster !== hub.clusterId}
          hidden={highlightCluster === hub.clusterId}
        />
      ))}

      <SceneControls zoomEnabled={zoomEnabled} />
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
  isDark,
}: CodebookCluster3DProps) {
  const layout = useMemo(
    () => buildCodebook3DLayout(sortedClusterIds, clusterToCodes, clusterColor, clusters),
    [sortedClusterIds, clusterToCodes, clusterColor, clusters]
  );
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [cursorMode, setCursorMode] = useState<Codebook3DCursorMode>("orbit");
  const dragging = useRef(false);
  const controlsActive = useRef(false);
  const cursors = useMemo(() => codebook3dCursors(isDark), [isDark]);
  const activeCursor = cursors[cursorMode];

  const setMode = useCallback((mode: Codebook3DCursorMode) => {
    setCursorMode(mode);
  }, []);

  useEffect(() => {
    const onPointerUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setCursorMode("orbit");
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, []);

  if (layout.nodes.length === 0) {
    return (
      <div className="codebook-3d-empty glass-panel">
        <p className="library-empty-body">No codes to visualize in 3D yet.</p>
      </div>
    );
  }

  return (
    <div className="codebook-3d-canvas-wrap glass-panel">
      <div className="codebook-3d-canvas-head">
        <h4>3D cluster map</h4>
        <span className="library-panel-sub">
          Scroll over the map to zoom · drag to orbit · click a node to sync
        </span>
      </div>
      <Codebook3DCursorContext.Provider value={{ setMode, dragging, controlsActive }}>
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
            onPointerMissed={() => {
              if (dragging.current || controlsActive.current || !highlighted) return;
              onClearSelection();
            }}
          >
            <Scene
              layout={layout}
              highlighted={highlighted}
              onSelectCode={onSelectCode}
              onClearSelection={onClearSelection}
              isDark={isDark}
              zoomEnabled={zoomEnabled}
            />
          </Canvas>
        </div>
      </Codebook3DCursorContext.Provider>
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
          <span className="library-panel-sub">Selected — drag it in the board below to move clusters</span>
        </div>
      )}
    </div>
  );
}

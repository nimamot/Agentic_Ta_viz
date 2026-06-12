import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  buildCodebook3DLayout,
  type CodeNode3D,
  type ClusterHub3D,
} from "../lib/codebookClusterLayout3d";
import type { ClusterEntry } from "../lib/codebookReview";

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
  isDark: boolean;
}

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function truncateLabel(text: string, max = 36): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function CodeSphere({
  node,
  highlighted,
  onSelect,
}: {
  node: CodeNode3D;
  highlighted: boolean;
  onSelect: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = hexToThree(node.color);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = highlighted ? 1.65 + Math.sin(Date.now() * 0.006) * 0.12 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(target, target, target), delta * 8);
  });

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={highlighted ? 1.1 : 0.45}
          roughness={0.35}
          metalness={0.15}
        />
        {highlighted && (
          <mesh scale={1.55}>
            <sphereGeometry args={[0.28, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.22} wireframe />
          </mesh>
        )}
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

const INITIAL_CAMERA_DISTANCE = 22;

function SceneControls({ zoomEnabled }: { zoomEnabled: boolean }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
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
      maxDistance={42}
      dampingFactor={0.08}
      enableDamping
    />
  );
}

function Scene({
  layout,
  highlighted,
  onSelectCode,
  isDark,
  zoomEnabled,
}: {
  layout: ReturnType<typeof buildCodebook3DLayout>;
  highlighted: HighlightedCode | null;
  onSelectCode: (code: string, clusterId: string) => void;
  isDark: boolean;
  zoomEnabled: boolean;
}) {
  const { nodes, hubs, edges } = layout;
  const highlightCluster = highlighted?.clusterId ?? null;

  return (
    <>
      <color attach="background" args={[isDark ? "#0a0c12" : "#e8ecf4"]} />
      <fog attach="fog" args={[isDark ? "#0a0c12" : "#e8ecf4", 28, 55]} />
      <ambientLight intensity={isDark ? 0.35 : 0.55} />
      <pointLight position={[12, 14, 10]} intensity={isDark ? 1.2 : 0.9} color="#7cf0d0" />
      <pointLight position={[-14, -8, -12]} intensity={0.6} color="#a78bfa" />
      <Stars radius={80} depth={40} count={isDark ? 1200 : 400} factor={3} fade speed={0.4} />

      {edges.map(([a, b], i) => (
        <Line
          key={`e-${i}`}
          points={[nodes[a].position, nodes[b].position]}
          color={nodes[a].color}
          transparent
          opacity={highlighted ? 0.35 : 0.18}
          lineWidth={1}
        />
      ))}

      {hubs.map((hub) => (
        <mesh key={`hub-${hub.clusterId}`} position={hub.position}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial
            color={hub.color}
            transparent
            opacity={highlightCluster === hub.clusterId ? 0.9 : 0.35}
          />
        </mesh>
      ))}

      {nodes.map((node) => (
        <CodeSphere
          key={`${node.clusterId}:${node.code}`}
          node={node}
          highlighted={highlighted?.code === node.code && highlighted.clusterId === node.clusterId}
          onSelect={() => onSelectCode(node.code, node.clusterId)}
        />
      ))}

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
  isDark,
}: CodebookCluster3DProps) {
  const layout = useMemo(
    () => buildCodebook3DLayout(sortedClusterIds, clusterToCodes, clusterColor, clusters),
    [sortedClusterIds, clusterToCodes, clusterColor, clusters]
  );
  const [zoomEnabled, setZoomEnabled] = useState(false);

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
      <div
        className="codebook-3d-canvas-host"
        onPointerEnter={() => setZoomEnabled(true)}
        onPointerLeave={() => setZoomEnabled(false)}
      >
        <Canvas
          className="codebook-3d-canvas"
          camera={{ position: [0, 0, INITIAL_CAMERA_DISTANCE], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          style={{ width: "100%", height: "100%", touchAction: "none" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Scene
            layout={layout}
            highlighted={highlighted}
            onSelectCode={onSelectCode}
            isDark={isDark}
            zoomEnabled={zoomEnabled}
          />
        </Canvas>
      </div>
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

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Icon } from "@iconify/react";
import type { PipelineNode as PNode } from "../lib/pipelineManifest";
import { MODEL_KIND_COLORS } from "../lib/pipelineManifest";

interface PipelineNodeProps {
  data: {
    pipelineNode: PNode;
    selected: boolean;
    isLoopMember: boolean;
    isValidator: boolean;
  };
}

export const PipelineNodeComponent = memo(function PipelineNodeComponent({
  data,
}: PipelineNodeProps) {
  const { pipelineNode: n, selected, isLoopMember, isValidator } = data;
  const accent = MODEL_KIND_COLORS[n.modelKind];

  /** Open coding + validate: split handles so submit (↓), retry (←), and PASS (→) use separate paths. */
  if (n.id === "open_coding") {
    return (
      <div
        className={`pipeline-node ${selected ? "pipeline-node--selected" : ""} ${isLoopMember ? "pipeline-node--loop" : ""} ${isValidator ? "pipeline-node--validator" : ""}`}
        style={{ "--node-accent": accent } as React.CSSProperties}
        aria-label={`${n.label} — ${n.engineBadge}`}
      >
        <Handle
          id="in"
          type="target"
          position={Position.Left}
          className="pipeline-handle"
          style={{ top: "32%" }}
        />
        <Handle
          id="retry-in"
          type="target"
          position={Position.Left}
          className="pipeline-handle"
          style={{ top: "68%" }}
        />
        <Handle
          id="submit"
          type="source"
          position={Position.Bottom}
          className="pipeline-handle"
          style={{ left: "50%" }}
        />

        <div className="pipeline-node-avatar">
          <Icon icon={n.avatar.icon} width={52} height={52} aria-hidden="true" />
        </div>
        <div className="pipeline-node-label">{n.label}</div>
        <div className="pipeline-node-engine" style={{ color: accent }}>
          {n.engineBadge}
        </div>
      </div>
    );
  }

  if (n.id === "validate_open_codes") {
    return (
      <div
        className={`pipeline-node ${selected ? "pipeline-node--selected" : ""} ${isLoopMember ? "pipeline-node--loop" : ""} ${isValidator ? "pipeline-node--validator" : ""}`}
        style={{ "--node-accent": accent } as React.CSSProperties}
        aria-label={`${n.label} — ${n.engineBadge}`}
      >
        <Handle
          id="submit-in"
          type="target"
          position={Position.Top}
          className="pipeline-handle"
          style={{ left: "50%" }}
        />
        <Handle
          id="retry-out"
          type="source"
          position={Position.Left}
          className="pipeline-handle"
          style={{ top: "58%" }}
        />
        <Handle
          id="pass-out"
          type="source"
          position={Position.Right}
          className="pipeline-handle"
        />

        <div className="pipeline-node-avatar">
          <Icon icon={n.avatar.icon} width={52} height={52} aria-hidden="true" />
        </div>
        <div className="pipeline-node-label">{n.label}</div>
        <div className="pipeline-node-engine" style={{ color: accent }}>
          {n.engineBadge}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pipeline-node ${selected ? "pipeline-node--selected" : ""} ${isLoopMember ? "pipeline-node--loop" : ""} ${isValidator ? "pipeline-node--validator" : ""}`}
      style={{ "--node-accent": accent } as React.CSSProperties}
      aria-label={`${n.label} — ${n.engineBadge}`}
    >
      <Handle type="target" position={Position.Left} className="pipeline-handle" />

      <div className="pipeline-node-avatar">
        <Icon icon={n.avatar.icon} width={52} height={52} aria-hidden="true" />
      </div>
      <div className="pipeline-node-label">{n.label}</div>
      <div className="pipeline-node-engine" style={{ color: accent }}>
        {n.engineBadge}
      </div>

      <Handle type="source" position={Position.Right} className="pipeline-handle" />
    </div>
  );
});

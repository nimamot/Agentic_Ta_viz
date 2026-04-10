import { Icon } from "@iconify/react";
import type { PipelineNode } from "../lib/pipelineManifest";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "../lib/pipelineManifest";
import { PipelineOpenCodingExampleOutput } from "./PipelineOpenCodingExampleOutput";
import { PipelineValidatorExampleTrace } from "./PipelineValidatorExampleTrace";

interface Props {
  node: PipelineNode;
  onClose: () => void;
}

export function PipelineDetailPanel({ node, onClose }: Props) {
  const accent = MODEL_KIND_COLORS[node.modelKind];
  const kindLabel = MODEL_KIND_LABELS[node.modelKind];

  return (
    <aside
      className="pipeline-detail"
      role="dialog"
      aria-labelledby="pipeline-detail-title"
      aria-modal="false"
    >
      <div className="pipeline-detail-head">
        <div className="pipeline-detail-avatar" style={{ borderColor: accent }}>
          <Icon icon={node.avatar.icon} width={36} height={36} aria-hidden="true" />
        </div>
        <div className="pipeline-detail-titles">
          <h3 id="pipeline-detail-title">{node.label}</h3>
          <span className="pipeline-detail-engine" style={{ color: accent }}>
            {kindLabel}
          </span>
        </div>
        <button
          type="button"
          className="pipeline-detail-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="pipeline-detail-body">
        <p className="pipeline-detail-desc">{node.description}</p>

        <div className="pipeline-detail-section">
          <h4>Model</h4>
          <p className="pipeline-detail-model" style={{ borderLeftColor: accent }}>
            {node.modelLabel}
          </p>
          <p className="pipeline-detail-model-note">
            Weights path configurable in <code>launch_sgl.sh</code>; report API
            overridable via <code>REPORT_*</code> env.
          </p>
        </div>

        {node.inputs.length > 0 && (
          <div className="pipeline-detail-section">
            <h4>Inputs</h4>
            <ul className="pipeline-detail-list">
              {node.inputs.map((inp) => (
                <li key={inp}>{inp}</li>
              ))}
            </ul>
          </div>
        )}

        {node.outputs.length > 0 && (
          <div className="pipeline-detail-section">
            <h4>Outputs</h4>
            <ul className="pipeline-detail-list">
              {node.outputs.map((out) => (
                <li key={out}>{out}</li>
              ))}
            </ul>
          </div>
        )}

        {node.id === "open_coding" && <PipelineOpenCodingExampleOutput />}

        {node.id === "validate_open_codes" && <PipelineValidatorExampleTrace />}
      </div>
    </aside>
  );
}

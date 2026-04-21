import { PipelineValidatorExampleTrace } from "./PipelineValidatorExampleTrace";

/**
 * Research deck slide: validator agent behavior (same static traces as the pipeline detail panel).
 */
export function ResearchValidatorAgentsSlide() {
  return (
    <div className="research-validator-agents-layout">
      <header className="research-validator-agents-header">
        <p className="research-validator-agents-lead">
          Validator agents check that open codes fit the <strong>research question</strong> and are grounded in the review
          text. A <strong>FAIL</strong> sends the run back to open coding — the same loop as on the Pipeline graph between{" "}
          <em>Open coding</em> and <em>Validate codes</em>.
        </p>
      </header>

      <section className="research-validator-agents-panel" aria-label="Validator example traces">
        <div className="research-validator-agents-panel-head">
          <p className="research-validator-agents-eyebrow">Sample tool logs</p>
          <h3 className="research-validator-agents-panel-title">Two end-to-end threads</h3>
        </div>
        <div className="research-validator-agents-trace-wrap">
          <PipelineValidatorExampleTrace layout="researchDeck" />
        </div>
      </section>
    </div>
  );
}

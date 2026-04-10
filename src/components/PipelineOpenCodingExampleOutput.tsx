type PipelineOpenCodingExampleOutputProps = {
  /** When false, hides the inner "Example tool output" heading (e.g. research slide supplies its own). */
  showInnerHeading?: boolean;
};

/**
 * Static example of open_coding TOOL_OUTPUT for the pipeline detail panel.
 */
export function PipelineOpenCodingExampleOutput({
  showInnerHeading = true,
}: PipelineOpenCodingExampleOutputProps) {
  return (
    <div className="pipeline-detail-section pipeline-open-coding-example">
      {showInnerHeading ? <h4>Example tool output</h4> : null}
      <p className="pipeline-validator-trace-intro">
        Excerpt from one review: applicability, reason, and evidence returned by the open-coding tool.
      </p>

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head pipeline-trace-event-head--wrap">
          <span className="pipeline-trace-ts">[15:32:53]</span>
          <span className="pipeline-trace-line-eq">=== TOOL_OUTPUT (open_coding) ===</span>
        </div>
        <div className="pipeline-trace-card pipeline-trace-card--open-coding-sample">
          <pre className="pipeline-open-coding-sample-pre">
{`- Applicability: NONE  
  Reason: The review mentions a high temperature issue but does not express dislike for the game or software itself; the concern is about hardware performance, not a flaw in the game's design or user experience.  
  Evidence: "my 7970 DD goes up to 75 degrees C when I try to leave the planet for some reason"`}
          </pre>
        </div>
      </div>
    </div>
  );
}

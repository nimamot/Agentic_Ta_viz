/**
 * Static example of open_coding → validate_open_codes loop for the pipeline detail panel.
 */
export function PipelineValidatorExampleTrace() {
  return (
    <div className="pipeline-detail-section pipeline-validator-trace">
      <h4>Sample tool output</h4>
      <p className="pipeline-validator-trace-intro">
        Example log from one review: the validator rejects weak grounding, then open coding retries and passes.
      </p>

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head">
          <span className="pipeline-trace-ts">[10:28:50]</span>
          <span className="pipeline-trace-tag">TOOL_OUTPUT</span>
          <span className="pipeline-trace-tool">open_coding</span>
        </div>
        <div className="pipeline-trace-card">
          <dl className="pipeline-trace-kv">
            <dt>Code</dt>
            <dd>lack of meaningful feedback</dd>
            <dt>Evidence</dt>
            <dd>
              <q>very cool.</q>
            </dd>
            <dt>Note</dt>
            <dd>
              The review offers no substantive critique, indicating absence of useful player feedback
            </dd>
          </dl>
        </div>
      </div>

      <div className="pipeline-trace-rule" aria-hidden="true" />

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head">
          <span className="pipeline-trace-ts">[10:28:51]</span>
          <span className="pipeline-trace-tag">TOOL_OUTPUT</span>
          <span className="pipeline-trace-tool">validate_open_codes</span>
        </div>
        <div className="pipeline-trace-card pipeline-trace-card--verdict">
          <p className="pipeline-trace-verdict pipeline-trace-verdict--fail">FAIL</p>
          <ol className="pipeline-trace-issues">
            <li>
              The code &quot;lack of meaningful feedback&quot; is not grounded in the review text. The review says
              &quot;very cool,&quot; which is a positive statement and does not indicate a lack of feedback.
            </li>
            <li>
              The evidence provided (&quot;very cool.&quot;) does not support the claim of a negative experience.
            </li>
          </ol>
        </div>
      </div>

      <div className="pipeline-trace-rule" aria-hidden="true" />

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head">
          <span className="pipeline-trace-ts">[10:28:52]</span>
          <span className="pipeline-trace-tag">TOOL_OUTPUT</span>
          <span className="pipeline-trace-tool">open_coding</span>
        </div>
        <div className="pipeline-trace-card">
          <dl className="pipeline-trace-kv">
            <dt>Code</dt>
            <dd className="pipeline-trace-kv--empty">—</dd>
            <dt>Note</dt>
            <dd>
              No code generated. The review offers no substantive critique, indicating absence of useful player
              feedback,
            </dd>
          </dl>
        </div>
      </div>

      <div className="pipeline-trace-rule" aria-hidden="true" />

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head">
          <span className="pipeline-trace-ts">[10:28:53]</span>
          <span className="pipeline-trace-tag">TOOL_OUTPUT</span>
          <span className="pipeline-trace-tool">validate_open_codes</span>
        </div>
        <div className="pipeline-trace-card pipeline-trace-card--verdict">
          <p className="pipeline-trace-verdict pipeline-trace-verdict--pass">PASS</p>
        </div>
      </div>
    </div>
  );
}

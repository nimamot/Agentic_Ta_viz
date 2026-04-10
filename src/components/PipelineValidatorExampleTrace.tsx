/**
 * Static example of open_coding → validate_open_codes loop for the pipeline detail panel.
 */
export function PipelineValidatorExampleTrace() {
  return (
    <div className="pipeline-detail-section pipeline-validator-trace">
      <h4>Sample tool output</h4>

      <h5 className="pipeline-validator-example-label">Example 1</h5>
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

      <div className="pipeline-validator-example-divider" aria-hidden="true" />

      <h5 className="pipeline-validator-example-label">Example 2</h5>
      <p className="pipeline-validator-trace-intro pipeline-validator-trace-intro--example2">
        Same review thread as the <strong>Open coding</strong> card example (GPU temperature /{" "}
        <code className="library-inline-code">Applicability: NONE</code>): the validator rejects that coding, open coding
        returns a grounded code, then validation passes.
      </p>

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head pipeline-trace-event-head--wrap">
          <span className="pipeline-trace-ts">[15:32:54]</span>
          <span className="pipeline-trace-line-eq">=== TOOL_OUTPUT (validate_open_codes) ===</span>
        </div>
        <div className="pipeline-trace-card pipeline-trace-card--verdict">
          <p className="pipeline-trace-verdict pipeline-trace-verdict--fail">FAIL</p>
          <ol className="pipeline-trace-issues">
            <li>
              The review contains a clear concern about game performance (high temperature when leaving the planet),
              which reflects a negative user experience related to the game&apos;s software behavior, not just
              hardware. This is relevant to the research question about what players dislike. Therefore,{" "}
              <code className="library-inline-code">Applicability: NONE</code> is incorrect.
            </li>
            <li>
              A relevant code should be generated, such as &quot;game causes excessive GPU temperature during
              gameplay,&quot; which is grounded in the evidence and evaluatively specific. The absence of such a code
              despite relevant content constitutes a failure to code appropriately.
            </li>
          </ol>
        </div>
      </div>

      <p className="pipeline-trace-separator-line" aria-hidden="true">
        ==============================
      </p>

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head pipeline-trace-event-head--wrap">
          <span className="pipeline-trace-ts">[15:32:54]</span>
          <span className="pipeline-trace-line-eq">=== TOOL_OUTPUT (open_coding) ===</span>
        </div>
        <div className="pipeline-trace-card pipeline-trace-card--open-coding-sample">
          <pre className="pipeline-open-coding-sample-pre">
{`- Code: excessive GPU temperature during gameplay  
  Evidence: "my 7970 DD goes up to 75 degrees C when i try to leave the planet for some reason."  
  Note: The reviewer explicitly reports high GPU temperature linked to in-game actions, indicating a negative software-related performance issue.`}
          </pre>
        </div>
      </div>

      <p className="pipeline-trace-separator-line" aria-hidden="true">
        ==============================
      </p>

      <div className="pipeline-trace-event">
        <div className="pipeline-trace-event-head pipeline-trace-event-head--wrap">
          <span className="pipeline-trace-ts">[15:32:54]</span>
          <span className="pipeline-trace-line-eq">=== TOOL_OUTPUT (validate_open_codes) ===</span>
        </div>
        <div className="pipeline-trace-card pipeline-trace-card--verdict">
          <p className="pipeline-trace-verdict pipeline-trace-verdict--pass">PASS</p>
        </div>
      </div>
    </div>
  );
}

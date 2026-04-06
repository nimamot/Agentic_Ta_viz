import { useCallback, useEffect, useId, useRef, useState } from "react";
import evalDatasetJson from "../data/schoolBurnoutEvalDataset.json";
import { PipelineView } from "./PipelineView";

interface SchoolBurnoutEvalRow {
  id: string;
  construct: string;
  dimension: string;
  dimension_description: string;
  indicator: string;
  text: string;
}

const EVAL_SCHOOL_BURNOUT_ROWS = evalDatasetJson as SchoolBurnoutEvalRow[];

/** Distinct dimension / indicator samples for the presentation table. */
const EVAL_DATASET_HIGHLIGHT_IDS = new Set([
  "syn_0000", // Exhaustion · overwhelmed by schoolwork
  "syn_0095", // Exhaustion · poor sleep due to schoolwork
  "syn_0202", // Cynicism · low motivation / giving up
  "syn_0402", // Inadequacy · lower expectations
]);

/** Edit these for your defense / portfolio slide deck. */
const PRESENTATION = {
  title: "LLM-Guided Grounded Thematic Analysis at Scale",
  author: "Nima Motieifard",
} as const;

const SECTION_COUNT = 8;

const SECTION_LABELS = [
  "Overview",
  "Background",
  "Focus",
  "My work",
  "Pipeline",
  "Evaluation",
  "Contribution",
  "Future",
] as const;

/** Section heading with accent bar (matches Background & motivation title style). */
function DeckSectionTitle({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="research-bm-page-title">
      <span className="research-bm-title-block">
        <span className="research-bm-title-line">{title}</span>
        <span className="research-bm-title-bar" aria-hidden="true" />
      </span>
    </h2>
  );
}

function IntersectionVenn() {
  const uid = useId().replace(/:/g, "");
  const p = `rv${uid}`;
  /** Symmetric 3-set layout: radius 92, centers on equilateral triangle around (200, 172). */
  const R = 92;
  const cx = 200;
  const cy = 172;
  const d = 54;
  const top = { x: cx, y: cy - d };
  const left = { x: cx - d * 0.866, y: cy + d * 0.5 };
  const right = { x: cx + d * 0.866, y: cy + d * 0.5 };

  /** Outermost point of each lobe: from circle center, away from the triple-overlap centroid (same idea as top label). */
  const lobeR = R * 0.36;
  const lobePoint = (c: { x: number; y: number }) => {
    const vx = cx - c.x;
    const vy = cy - c.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: c.x - (vx / len) * lobeR, y: c.y - (vy / len) * lobeR };
  };
  const topLobe = lobePoint(top);
  const leftLobe = lobePoint(left);
  const rightLobe = lobePoint(right);
  const lineGap = 11;

  return (
    <figure className="research-venn" aria-label="Research sits at the intersection of three fields">
      <svg viewBox="40 8 320 298" className="research-venn-svg" role="img">
        <defs>
          <radialGradient id={`${p}-r1`} cx="32%" cy="28%" r="78%">
            <stop offset="0%" stopColor="var(--research-venn-1)" stopOpacity="0.85" />
            <stop offset="45%" stopColor="var(--research-venn-1)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--research-venn-1)" stopOpacity="0.06" />
          </radialGradient>
          <radialGradient id={`${p}-r2`} cx="68%" cy="28%" r="78%">
            <stop offset="0%" stopColor="var(--research-venn-2)" stopOpacity="0.85" />
            <stop offset="45%" stopColor="var(--research-venn-2)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--research-venn-2)" stopOpacity="0.06" />
          </radialGradient>
          <radialGradient id={`${p}-r3`} cx="50%" cy="72%" r="78%">
            <stop offset="0%" stopColor="var(--research-venn-3)" stopOpacity="0.85" />
            <stop offset="45%" stopColor="var(--research-venn-3)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--research-venn-3)" stopOpacity="0.06" />
          </radialGradient>
          <filter id={`${p}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${p}-label-shadow`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.28" />
          </filter>
        </defs>

        <g className="research-venn-circles" filter={`url(#${p}-glow)`}>
          <circle
            cx={top.x}
            cy={top.y}
            r={R}
            fill={`url(#${p}-r1)`}
            stroke="var(--research-venn-1)"
            strokeWidth="1.35"
            strokeOpacity="0.72"
            className="research-venn-circle"
          />
          <circle
            cx={left.x}
            cy={left.y}
            r={R}
            fill={`url(#${p}-r3)`}
            stroke="var(--research-venn-3)"
            strokeWidth="1.35"
            strokeOpacity="0.72"
            className="research-venn-circle"
          />
          <circle
            cx={right.x}
            cy={right.y}
            r={R}
            fill={`url(#${p}-r2)`}
            stroke="var(--research-venn-2)"
            strokeWidth="1.35"
            strokeOpacity="0.72"
            className="research-venn-circle"
          />
        </g>

        <rect
          x={cx - 56}
          y={cy - 18}
          width="112"
          height="36"
          rx="10"
          className="research-venn-hub"
        />

        {/*
          Labels at lobe centroids (symmetric with top): anchor is inside the disk so
          textAnchor="middle" glyphs stay inside the circle.
        */}
        <text
          x={topLobe.x}
          y={topLobe.y - lineGap}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          Computer
        </text>
        <text
          x={topLobe.x}
          y={topLobe.y + lineGap}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          science
        </text>

        <text
          x={leftLobe.x}
          y={leftLobe.y - lineGap}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          Computational
        </text>
        <text
          x={leftLobe.x}
          y={leftLobe.y + lineGap}
          textAnchor="middle"
          className="research-venn-label research-venn-label--small"
          filter={`url(#${p}-label-shadow)`}
        >
          social science
        </text>

        <text
          x={rightLobe.x}
          y={rightLobe.y}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          Linguistics
        </text>

        <text x={cx} y={cy + 5} textAnchor="middle" className="research-venn-center" filter={`url(#${p}-label-shadow)`}>
          This work
        </text>
      </svg>
    </figure>
  );
}

function GroundedTheorySteps() {
  const steps = [
    { n: "1", title: "Open coding", desc: "Break text into discrete codes grounded in the data." },
    { n: "2", title: "Axial coding", desc: "Relate codes into categories and patterns." },
    { n: "3", title: "Selective coding", desc: "Integrate around a core storyline or framework." },
  ];
  return (
    <ol className="research-gt-steps">
      {steps.map((s) => (
        <li key={s.n} className="research-gt-step">
          <span className="research-gt-step-num">{s.n}</span>
          <div>
            <strong className="research-gt-step-title">{s.title}</strong>
            <p className="research-gt-step-desc">{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EvalDatasetTable() {
  const n = EVAL_SCHOOL_BURNOUT_ROWS.length;
  return (
    <figure className="research-eval-dataset">
      <figcaption className="research-eval-dataset-caption">
        <code className="research-eval-filename">school_burnout_synthetic</code>
        <span className="research-eval-dataset-meta">
          {" "}
          · {n} rows × 4 columns · Theme, Theme_description, indicator, text
        </span>
        <span className="research-eval-dataset-hint">
          {" "}
          Theme columns are <strong>gold labels</strong>; the pipeline evaluation uses <strong>text</strong> only.
        </span>
      </figcaption>
      <div className="research-eval-table-scroll" tabIndex={0} role="region" aria-label="Dataset table, scroll vertically">
        <table className="research-eval-table">
          <thead>
            <tr>
              <th scope="col">Theme</th>
              <th scope="col">Theme_description</th>
              <th scope="col">indicator</th>
              <th scope="col">text</th>
            </tr>
          </thead>
          <tbody>
            {EVAL_SCHOOL_BURNOUT_ROWS.map((row) => (
              <tr
                key={row.id}
                className={EVAL_DATASET_HIGHLIGHT_IDS.has(row.id) ? "research-eval-tr--highlight" : undefined}
              >
                <td className="research-eval-td research-eval-td--dimension">{row.dimension}</td>
                <td className="research-eval-td research-eval-td--desc">{row.dimension_description}</td>
                <td className="research-eval-td research-eval-td--indicator">{row.indicator}</td>
                <td className="research-eval-td research-eval-td--text">{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function MyWorkFlow({ className }: { className?: string }) {
  return (
    <div className={className ? `research-workflow ${className}` : "research-workflow"} aria-label="Inputs to outputs">
      <div className="research-workflow-row">
        <div className="research-workflow-card">
          <h3 className="research-workflow-card-title">Input data</h3>
          <p className="research-workflow-card-body">Text corpus (e.g. reviews) plus an explicit research question.</p>
        </div>
        <span className="research-workflow-arrow" aria-hidden="true">
          →
        </span>
        <div className="research-workflow-card research-workflow-card--accent">
          <h3 className="research-workflow-card-title">My workflow</h3>
          <p className="research-workflow-card-body">LLM-based agent pipeline for coding, validation, and structure.</p>
        </div>
        <span className="research-workflow-arrow" aria-hidden="true">
          →
        </span>
        <div className="research-workflow-card">
          <h3 className="research-workflow-card-title">Outputs</h3>
          <p className="research-workflow-card-body">Codebook, hierarchical theme graph, and narrative research report.</p>
        </div>
      </div>
    </div>
  );
}

interface ResearchOverviewProps {
  isDark: boolean;
}

export function ResearchOverview({ isDark }: ResearchOverviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const goTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    const clamped = Math.min(Math.max(0, index), SECTION_COUNT - 1);
    el.scrollTo({ top: clamped * h, behavior: "smooth" });
    setActive(clamped);
  }, []);

  const syncActiveFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    if (h <= 0) return;
    const idx = Math.round(el.scrollTop / h);
    setActive(Math.min(Math.max(0, idx), SECTION_COUNT - 1));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncActiveFromScroll();
    el.addEventListener("scroll", syncActiveFromScroll, { passive: true });
    const ro = new ResizeObserver(() => syncActiveFromScroll());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncActiveFromScroll);
      ro.disconnect();
    };
  }, [syncActiveFromScroll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(active + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(active - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(SECTION_COUNT - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo]);

  return (
    <div className="research-overview" data-theme={isDark ? "dark" : "light"}>
      <div ref={scrollRef} className="research-overview-scroll" tabIndex={0}>
        <section className="research-slide research-slide--hero" aria-labelledby="research-slide-0-title">
          <div className="research-slide-inner research-slide-inner--hero">
            <div className="research-hero-head">
              <div className="research-deck-panel research-deck-panel--neutral research-hero-intro-panel">
                <p className="research-kicker">Research overview</p>
                <h1 id="research-slide-0-title" className="research-title">
                  {PRESENTATION.title}
                </h1>
                <p className="research-author">{PRESENTATION.author}</p>
              </div>
            </div>
            <div className="research-hero-vis">
              <IntersectionVenn />
            </div>
          </div>
        </section>

        <section className="research-slide research-slide--bm" aria-labelledby="research-slide-1-title">
          <div className="research-slide-inner research-slide-inner--deck research-slide-inner--bm-slide">
            <h2 id="research-slide-1-title" className="research-bm-page-title">
              <span className="research-bm-title-block research-bm-title-block--with-join">
                <span className="research-bm-title-line">Background</span>
                <span className="research-bm-title-join">&nbsp;&amp; motivation</span>
                <span className="research-bm-title-bar" aria-hidden="true" />
              </span>
            </h2>

            <div className="research-bm-grid research-bm-grid--slide-deck">
              <section
                className="research-deck-panel research-deck-panel--neutral research-bm-slide-card"
                aria-labelledby="bm-why-matters-heading"
              >
                <h3 id="bm-why-matters-heading" className="research-bm-slide-label">
                  Why it matters
                </h3>
                <p className="research-bm-slide-claim">Turns raw text into explanation</p>
                <ul className="research-bm-slide-bullets">
                  <li>context</li>
                  <li>meaning</li>
                  <li>explanation</li>
                  <li>theory-building</li>
                </ul>
              </section>

              <section
                className="research-deck-panel research-deck-panel--lavender research-bm-slide-card"
                aria-labelledby="bm-llm-help-heading"
              >
                <h3 id="bm-llm-help-heading" className="research-bm-slide-label">
                  Why LLMs help
                </h3>
                <p className="research-bm-slide-claim">LLMs make qualitative analysis more scalable</p>
                <ul className="research-bm-slide-bullets">
                  <li>coding</li>
                  <li>grouping</li>
                  <li>theme generation</li>
                  <li>larger corpora</li>
                </ul>
              </section>

              <section
                className="research-deck-panel research-deck-panel--teal research-bm-slide-card research-bm-slide-card--span"
                aria-labelledby="bm-current-work-heading"
              >
                <h3 id="bm-current-work-heading" className="research-bm-slide-label">
                  Current work
                </h3>
                <div className="research-bm-work-minis">
                  <div className="research-bm-mini-card">
                    <p className="research-bm-mini-name">LOGOS</p>
                    <ul className="research-bm-mini-list">
                      <li>GT-style coding</li>
                      <li>structured codebooks</li>
                      <li>hierarchy construction</li>
                    </ul>
                  </div>
                  <div className="research-bm-mini-card">
                    <p className="research-bm-mini-name">Thematic-LM</p>
                    <ul className="research-bm-mini-list">
                      <li>multi-agent setup</li>
                      <li>large-scale TA</li>
                      <li>adaptive codebook</li>
                    </ul>
                  </div>
                  <div className="research-bm-mini-card">
                    <p className="research-bm-mini-name">LLM-Assisted TA</p>
                    <ul className="research-bm-mini-list">
                      <li>methodological reflection</li>
                      <li>risks and tradeoffs</li>
                      <li>human oversight</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section
                className="research-deck-panel research-deck-panel--neutral research-bm-slide-card research-bm-slide-card--span"
                aria-labelledby="bm-gap-mot-heading"
              >
                <h3 id="bm-gap-mot-heading" className="research-bm-slide-label">
                  Gap &amp; motivation
                </h3>
                <p className="research-bm-slide-claim">Scale alone is not enough</p>
                <ul className="research-bm-slide-bullets">
                  <li>transparency</li>
                  <li>contextual fidelity</li>
                  <li>reproducibility</li>
                  <li>researcher oversight</li>
                </ul>
                <p className="research-bm-slide-focus">
                  <strong>My focus:</strong> validated, traceable, research-question-guided workflow
                </p>
              </section>
            </div>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-2-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-2-title" title="Focus" />
            <div className="research-bm-grid">
              <section className="research-deck-panel research-deck-panel--lavender" aria-labelledby="research-focus-ta">
                <h3 id="research-focus-ta" className="research-bm-panel-h">
                  Thematic analysis
                </h3>
                <p className="research-bm-panel-body">
                  A family of approaches for identifying, analyzing, and reporting patterns (themes) across qualitative
                  data. Themes capture shared meaning relevant to the research question and are typically illustrated
                  with data extracts.
                </p>
              </section>
              <section className="research-deck-panel research-deck-panel--teal" aria-labelledby="research-focus-gt">
                <h3 id="research-focus-gt" className="research-bm-panel-h">
                  Grounded theory (GT)
                </h3>
                <p className="research-bm-panel-body">
                  An inductive methodology for building theory from data. In social science it is widely used to study
                  human behavior and social dynamics—often at scale when texts (interviews, posts, reviews) stand in for
                  field notes.
                </p>
              </section>
              <section
                className="research-deck-panel research-deck-panel--neutral research-deck-panel--span"
                aria-labelledby="research-focus-gt-steps"
              >
                <p className="research-bm-kicker">Coding trajectory</p>
                <h3 id="research-focus-gt-steps" className="research-bm-panel-h">
                  Typical GT coding trajectory
                </h3>
                <GroundedTheorySteps />
              </section>
            </div>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-3-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-3-title" title="My work" />
            <section className="research-deck-panel research-deck-panel--neutral research-deck-panel--span">
              <p className="research-bm-kicker">Scope</p>
              <p className="research-bm-panel-lead">
                End-to-end flow from your corpus to structured outputs and a report.
              </p>
              <MyWorkFlow className="research-workflow--deck" />
            </section>
          </div>
        </section>

        <section className="research-slide research-slide--pipeline" aria-labelledby="research-slide-4-title">
          <h2 id="research-slide-4-title" className="research-visually-hidden">
            Pipeline in detail
          </h2>
          <PipelineView isDark={isDark} presentationEmbed />
        </section>

        <section className="research-slide" aria-labelledby="research-slide-5-title">
          <div className="research-slide-inner research-slide-inner--eval">
            <DeckSectionTitle id="research-slide-5-title" title="Pipeline evaluation" />
            <section className="research-deck-panel research-deck-panel--neutral research-deck-panel--span">
              <p className="research-bm-kicker">Evaluation dataset</p>
              <p className="research-bm-panel-body">Gold labels · text-only in.</p>
              <EvalDatasetTable />
            </section>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-6-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-6-title" title="Contribution" />
            <div className="research-bm-grid">
              <section className="research-deck-panel research-deck-panel--lavender">
                <h3 className="research-bm-panel-h">Built-in validation</h3>
                <p className="research-bm-panel-body">
                  Reviews both generated codes and code-to-theme assignments.
                </p>
              </section>
              <section className="research-deck-panel research-deck-panel--teal">
                <h3 className="research-bm-panel-h">Open-source workflow</h3>
                <p className="research-bm-panel-body">
                  Modular, extensible pipeline for LLM-guided thematic analysis.
                </p>
              </section>
              <section
                className="research-deck-panel research-deck-panel--neutral research-deck-panel--span"
                aria-label="Additional contributions"
              >
                <p className="research-bm-kicker">Highlights</p>
                <ul className="research-bm-list research-bm-list--loose research-contribution-more">
                  <li>
                    <strong>Skill-based agent design</strong> — Separates reusable stage skills from run-specific prompts
                    and inputs.
                  </li>
                  <li>
                    <strong>Research-question-guided analysis</strong> — Keeps coding and theme construction aligned with
                    the analytic goal.
                  </li>
                  <li>
                    <strong>Traceable visualization dashboard</strong> — Lets users follow themes, codes, and reports back
                    to source text.
                  </li>
                  <li>
                    <strong>End-to-end system</strong> — Goes from corpus input to codebook, hierarchy, and final report.
                  </li>
                  <li>
                    <strong>Grounded-theory-inspired structure</strong> — Translates qualitative coding stages into an
                    inspectable agent workflow.
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-7-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-7-title" title="Future improvements" />
            <section className="research-deck-panel research-deck-panel--neutral research-deck-panel--span">
              <ul className="research-bm-list research-bm-list--loose">
                <li>
                  <strong>Parallelized open coding</strong> — shard the corpus across workers while preserving shared code
                  lists and merge semantics.
                </li>
                <li>
                  <strong>Human-in-the-loop checkpoints</strong> — optional review gates before axial clustering and before
                  final reporting.
                </li>
                <li>
                  <strong>Calibration &amp; evaluation</strong> — systematic comparison to human-coded gold subsets and
                  stability under prompt or model changes.
                </li>
                <li>
                  <strong>Streaming &amp; incremental updates</strong> — extend the workflow as new text arrives without a
                  full rerun.
                </li>
              </ul>
            </section>
          </div>
        </section>
      </div>

      <nav className="research-nav" aria-label="Presentation sections">
        <div className="research-nav-dots">
          {SECTION_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`research-nav-dot ${i === active ? "research-nav-dot--active" : ""}`}
              aria-label={`Go to section ${i + 1}: ${label}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <div className="research-nav-arrows">
          <button
            type="button"
            className="research-nav-arrow"
            aria-label="Previous section"
            disabled={active <= 0}
            onClick={() => goTo(active - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="research-nav-arrow"
            aria-label="Next section"
            disabled={active >= SECTION_COUNT - 1}
            onClick={() => goTo(active + 1)}
          >
            ↓
          </button>
        </div>
      </nav>
    </div>
  );
}

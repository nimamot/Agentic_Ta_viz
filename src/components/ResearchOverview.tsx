import { useCallback, useEffect, useId, useRef, useState } from "react";
import evalDatasetJson from "../data/schoolBurnoutEvalDataset.json";
import { PipelineView } from "./PipelineView";
import { ResearchValidatorAgentsSlide } from "./ResearchValidatorAgentsSlide";
import evalHeatmap from "../../public/eval/heatmap.png";

interface SchoolBurnoutEvalRow {
  id: string;
  construct: string;
  dimension: string;
  dimension_description: string;
  indicator: string;
  text: string;
}

const EVAL_SCHOOL_BURNOUT_ROWS = evalDatasetJson as SchoolBurnoutEvalRow[];

/** Pipeline eval metrics (same run as confusion-matrix heatmap). */
const EVAL_PER_CLASS_METRICS = [
  {
    className: "Cynicism toward the meaning of school",
    precision: 0.818182,
    recall: 0.782609,
    f1: 0.8,
  },
  {
    className: "Exhaustion at school",
    precision: 0.83871,
    recall: 0.866667,
    f1: 0.852459,
  },
  {
    className: "Sense of inadequacy at school",
    precision: 0.923077,
    recall: 0.8,
    f1: 0.857143,
  },
] as const;

const EVAL_OVERALL_METRICS = [
  { metric: "accuracy", value: 0.823529 },
  { metric: "macro_f1", value: 0.836534 },
  { metric: "weighted_f1", value: 0.835749 },
] as const;

function fmt6(n: number): string {
  return n.toFixed(6);
}

/** Edit these for your defense / portfolio slide deck. */
const PRESENTATION = {
  title: "Agentic Workflows for Qualitative Research",
  subtitle: "An LLM-guided pipeline for grounded thematic analysis",
  author: "Nima Motieifard",
  supervisorName: "Jian Zhu",
  supervisorUrl: "https://linguistics.ubc.ca/profile/jian-zhu/",
} as const;

const SECTION_COUNT = 10;

const SECTION_LABELS = [
  "Overview",
  "Background",
  "Motivation",
  "This work",
  "Pipeline",
  "Evaluation",
  "Validators",
  "Contribution",
  "Future",
  "References",
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

        {/* center label only, no box */}

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
          Research Focus
        </text>
      </svg>
    </figure>
  );
}

function GroundedTheorySteps() {
  const steps = [
    { n: "1", title: "Open coding", desc: "Discrete codes from the data" },
    { n: "2", title: "Axial coding", desc: "Categories and relationships" },
    { n: "3", title: "Selective coding", desc: "Core storyline / framework" },
  ];
  return (
    <ol className="research-gt-steps">
      {steps.map((s) => (
        <li key={s.n} className="research-gt-step">
          <div className="research-gt-step-inner">
            <span className="research-gt-step-num">{s.n}</span>
            <strong className="research-gt-step-title">{s.title}</strong>
            <p className="research-gt-step-desc">{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EvalPerClassMetricsTable() {
  return (
    <div className="research-eval-metrics-scroll">
      <table className="research-eval-metrics-table">
        <thead>
          <tr>
            <th scope="col" className="research-eval-metrics-th research-eval-metrics-th--idx">
              #
            </th>
            <th scope="col">Class</th>
            <th scope="col" className="research-eval-metrics-th--num">
              Precision
            </th>
            <th scope="col" className="research-eval-metrics-th--num">
              Recall
            </th>
            <th scope="col" className="research-eval-metrics-th--num">
              F1
            </th>
          </tr>
        </thead>
        <tbody>
          {EVAL_PER_CLASS_METRICS.map((row, i) => (
            <tr key={row.className}>
              <td className="research-eval-metrics-td research-eval-metrics-td--idx">{i}</td>
              <td className="research-eval-metrics-td research-eval-metrics-td--class">{row.className}</td>
              <td className="research-eval-metrics-td research-eval-metrics-td--num">{fmt6(row.precision)}</td>
              <td className="research-eval-metrics-td research-eval-metrics-td--num">{fmt6(row.recall)}</td>
              <td className="research-eval-metrics-td research-eval-metrics-td--num">{fmt6(row.f1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvalOverallMetricsTable() {
  return (
    <div className="research-eval-metrics-scroll research-eval-metrics-scroll--compact">
      <table className="research-eval-metrics-table research-eval-metrics-table--summary">
        <thead>
          <tr>
            <th scope="col" className="research-eval-metrics-th research-eval-metrics-th--idx">
              #
            </th>
            <th scope="col">Metric</th>
            <th scope="col" className="research-eval-metrics-th--num">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {EVAL_OVERALL_METRICS.map((row, i) => (
            <tr key={row.metric}>
              <td className="research-eval-metrics-td research-eval-metrics-td--idx">{i}</td>
              <td className="research-eval-metrics-td">{row.metric}</td>
              <td className="research-eval-metrics-td research-eval-metrics-td--num">{fmt6(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvalDatasetTable() {
  const n = EVAL_SCHOOL_BURNOUT_ROWS.length;
  return (
    <figure className="research-eval-dataset">
      <figcaption className="research-eval-dataset-caption">
        <code className="research-eval-filename">school_burnout_synthetic</code>
        <span className="research-eval-dataset-meta">
          {" "}· {n} rows × 4 columns
        </span>
      </figcaption>
      <div className="research-eval-table-scroll" tabIndex={0} role="region" aria-label="Dataset table">
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
              <tr key={row.id}>
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
                <p className="research-subtitle">{PRESENTATION.subtitle}</p>
                <p className="research-author">{PRESENTATION.author}</p>
                <p className="research-supervisor">
                  Supervisor:{" "}
                  <a href={PRESENTATION.supervisorUrl} target="_blank" rel="noopener noreferrer">
                    {PRESENTATION.supervisorName}
                  </a>
                </p>
              </div>
            </div>
            <div className="research-hero-vis">
              <IntersectionVenn />
            </div>
          </div>
        </section>

        {/* ── Slide 1: Thematic Analysis & Grounded Theory ── */}
        <section className="research-slide research-slide--bm" aria-labelledby="research-slide-1-title">
          <div className="research-slide-inner research-slide-inner--deck research-slide-inner--bm-slide">
            <DeckSectionTitle id="research-slide-1-title" title="Background" />
            <div className="research-bm-grid research-bm-grid--narrative">
              {/* Row 1: TA + Social science importance */}
              <section
                className="research-deck-panel research-deck-panel--lavender research-bm-slide-card"
                aria-labelledby="research-focus-ta-heading"
              >
                <p className="research-bm-slide-label">What is</p>
                <h3 id="research-focus-ta-heading" className="research-bm-slide-claim">
                  Thematic Analysis (TA)
                </h3>
                <p className="research-bm-slide-sub">
                  Identifying shared patterns of meaning across qualitative text
                </p>
                <ul className="research-bm-slide-bullets">
                  <li>Interviews, surveys, social media, documents</li>
                  <li>Guided by a research question</li>
                  <li>Interpretation — not word counts</li>
                </ul>
              </section>

              <section
                className="research-deck-panel research-deck-panel--teal research-bm-slide-card"
                aria-labelledby="research-focus-ss-heading"
              >
                <p className="research-bm-slide-label">Why it matters</p>
                <h3 id="research-focus-ss-heading" className="research-bm-slide-claim">
                  Central to Social Science
                </h3>
                <p className="research-bm-slide-sub">
                  The core method family for text-based inquiry
                </p>
                <ul className="research-bm-slide-bullets">
                  <li>Health, education, policy, psychology</li>
                  <li>Captures context, meaning, and nuance</li>
                  <li>But: manual, slow, hard to scale</li>
                </ul>
              </section>

              {/* Row 2: GT definition + GT steps visual */}
              <section
                className="research-deck-panel research-deck-panel--neutral research-bm-slide-card"
                aria-labelledby="research-focus-gt-heading"
              >
                <p className="research-bm-slide-label">The standard approach</p>
                <h3 id="research-focus-gt-heading" className="research-bm-slide-claim">
                  Grounded Theory (GT)
                </h3>
                <p className="research-bm-slide-sub">
                  Building themes inductively from data
                </p>
                <ul className="research-bm-slide-bullets">
                  <li>Theory emerges from the text itself</li>
                  <li>Systematic: codes → categories → themes</li>
                  <li>Widely used to structure thematic analysis</li>
                </ul>
              </section>

              <section
                className="research-deck-panel research-deck-panel--lavender research-bm-slide-card research-bm-slide-card--gt-trajectory"
                aria-labelledby="research-focus-gt-steps-heading"
              >
                <h3 id="research-focus-gt-steps-heading" className="research-gt-trajectory-title">
                  GT coding stages
                </h3>
                <GroundedTheorySteps />
              </section>
            </div>
          </div>
        </section>

        {/* ── Slide 2: LLM Opportunity → Current Work → Gap ── */}
        <section className="research-slide research-slide--bm" aria-labelledby="research-slide-2-title">
          <div className="research-slide-inner research-slide-inner--deck research-slide-inner--bm-slide">
            <DeckSectionTitle id="research-slide-2-title" title="Motivation" />

            <div className="research-bm-grid research-bm-grid--narrative">
              {/* Row 1: LLM opportunity (full width) */}
              <section
                className="research-deck-panel research-deck-panel--lavender research-bm-slide-card research-bm-slide-card--span"
                aria-labelledby="bm-llm-opportunity-heading"
              >
                <p className="research-bm-slide-label">The opportunity</p>
                <h3 id="bm-llm-opportunity-heading" className="research-bm-slide-claim">
                  LLMs for Qualitative Analysis
                </h3>
                <p className="research-bm-slide-sub">
                  LLMs can perform the cognitive steps of GT — coding, grouping, abstracting — at scale
                </p>
                <ul className="research-bm-slide-bullets research-bm-slide-bullets--inline">
                  <li>Process thousands of texts</li>
                  <li>Generate and refine codes</li>
                  <li>Build thematic hierarchies</li>
                  <li>Produce narrative reports</li>
                </ul>
              </section>

              {/* Row 2: Current work + Gap & motivation */}
              <section
                className="research-deck-panel research-deck-panel--teal research-bm-slide-card"
                aria-labelledby="bm-current-work-heading"
              >
                {/* <p className="research-bm-slide-label">Existing approaches</p> */}
                <h3 id="bm-current-work-heading" className="research-bm-slide-claim research-bm-slide-claim--sm">
                  Current Work
                </h3>
                <div className="research-bm-work-minis">
                  <div className="research-bm-mini-card">
                    <p className="research-bm-mini-name">
                      LOGOS — LLM-driven end-to-end grounded theory framework
                    </p>
                    <p className="research-bm-mini-desc">
                      Grounded-theory–style coding, clustering, and hierarchical schema induction for qualitative
                      corpora.
                    </p>
                  </div>
                  <div className="research-bm-mini-card">
                    <p className="research-bm-mini-name">
                      Thematic-LM — LLM-based multi-agent system for large-scale thematic analysis
                    </p>
                    <p className="research-bm-mini-desc">
                      Multiple language-model agents (coding, aggregation, codebook updates) to run thematic analysis at
                      scale on large datasets.
                    </p>
                  </div>
                  <div className="research-bm-mini-card">
                    <p className="research-bm-mini-name">
                      Large language model–assisted thematic analysis
                    </p>
                    <p className="research-bm-mini-desc">
                      Methodological reflection, transparency, and human oversight in LLM-supported thematic analysis
                      workflows.
                    </p>
                  </div>
                </div>
              </section>

              <section
                className="research-deck-panel research-deck-panel--neutral research-bm-slide-card"
                aria-labelledby="bm-gap-mot-heading"
              >
                {/* <p className="research-bm-slide-label">What's missing</p> */}
                <h3 id="bm-gap-mot-heading" className="research-bm-slide-claim research-bm-slide-claim--sm">
                  Gap &amp; Motivation
                </h3>
                <p className="research-bm-slide-sub">Scale alone is not enough</p>
                <ul className="research-bm-slide-bullets">
                  <li>Limited transparency</li>
                  <li>Weak contextual fidelity</li>
                  <li>No reproducibility guarantees</li>
                  <li>Insufficient researcher oversight</li>
                </ul>
                <div className="research-bm-slide-focus">
                  <p className="research-bm-slide-focus-lead">My focus</p>
                  <ul className="research-bm-slide-bullets research-bm-slide-bullets--focus">
                    <li><strong>Validation</strong> built in at key coding stages</li>
                    <li><strong>Traceability</strong> from themes back to source text</li>
                    <li><strong>Research-question</strong> alignment throughout the pipeline</li>
                    <li><strong>Research-facing</strong> outputs for inspection and use</li>
                  </ul>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="research-slide research-slide--bm" aria-labelledby="research-slide-3-title">
          <div className="research-slide-inner research-slide-inner--deck research-slide-inner--bm-slide">
            <DeckSectionTitle id="research-slide-3-title" title="This work" />
            <div className="research-bm-grid research-bm-grid--narrative">
              {/* Research question — full width, prominent */}
              <section
                className="research-deck-panel research-deck-panel--lavender research-bm-slide-card research-bm-slide-card--span"
                aria-labelledby="rq-heading"
              >
                <p className="research-bm-slide-label">Research question</p>
                <h3 id="rq-heading" className="research-bm-slide-claim">
                  Can an LLM-based pipeline perform grounded thematic analysis that is transparent, traceable, and faithful to the source data?
                </h3>
              </section>
            </div>
          </div>
        </section>

        <section className="research-slide research-slide--pipeline" aria-labelledby="research-slide-4-title">
          <div className="research-slide-inner research-slide-inner--pipeline">
            <DeckSectionTitle id="research-slide-4-title" title="Pipeline" />
            <PipelineView isDark={isDark} presentationEmbed />
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-5-title">
          <div className="research-slide-inner research-slide-inner--eval">
            <DeckSectionTitle id="research-slide-5-title" title="Pipeline evaluation" />

            <section className="research-deck-panel research-deck-panel--neutral research-eval-dataset-compact">
              <h3 className="research-eval-dataset-heading">Evaluation dataset</h3>
              <EvalDatasetTable />
            </section>

            <div className="research-eval-results-grid">
              <section className="research-deck-panel research-deck-panel--neutral research-eval-results-card research-eval-results-card--wide">
                <p className="research-bm-kicker">Confusion matrix</p>
                <img
                  src={evalHeatmap}
                  alt="Test confusion matrix — gold themes vs pipeline predictions"
                  className="research-eval-img"
                />
              </section>

              <div className="research-eval-results-side">
                <section className="research-deck-panel research-deck-panel--lavender research-eval-results-card">
                  <p className="research-bm-kicker">Per-class metrics</p>
                  <EvalPerClassMetricsTable />
                </section>

                <section className="research-deck-panel research-deck-panel--teal research-eval-results-card">
                  <p className="research-bm-kicker">Overall performance</p>
                  <EvalOverallMetricsTable />
                </section>
              </div>
            </div>
          </div>
        </section>

        <section
          className="research-slide research-slide--bm research-slide--validator-agents"
          aria-labelledby="research-slide-6-title"
        >
          <div className="research-slide-inner research-slide-inner--deck research-slide-inner--validator-agents">
            <DeckSectionTitle id="research-slide-6-title" title="Validator agent performance" />
            <ResearchValidatorAgentsSlide />
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-7-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-7-title" title="Contribution" />
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
                <ul className="research-bm-list research-bm-list--loose research-contribution-more research-contribution-highlights">
                  <li>
                    <strong>Traceable visualization dashboard</strong>
                    <span className="research-contribution-detail">
                      Lets researchers follow themes, codes, and reports back to source text.
                    </span>
                  </li>
                  <li>
                    <strong>Agentic, staged workflow (grounded-theory-inspired)</strong>
                    <span className="research-contribution-detail">
                      Mirrors open, axial, and selective coding in a structured pipeline.
                    </span>
                  </li>
                  <li>
                    <strong>Research-question-guided analysis</strong>
                    <span className="research-contribution-detail">
                      Keeps all stages aligned with the analytic goal.
                    </span>
                  </li>
                  <li>
                    <strong>End-to-end system</strong>
                    <span className="research-contribution-detail">
                      Goes from raw corpus to codebook, hierarchy, and final report.
                    </span>
                  </li>
                  <li>
                    <strong>Quantitative evaluation on held-out data</strong>
                    <span className="research-contribution-detail">
                      Shows the pipeline can recover gold themes with strong performance.
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-8-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-8-title" title="Future Work" />
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
              </ul>
            </section>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-9-title">
          <div className="research-slide-inner research-slide-inner--deck">
            <DeckSectionTitle id="research-slide-9-title" title="References" />
            <section className="research-deck-panel research-deck-panel--neutral research-deck-panel--span research-references-panel">
              <ol className="research-references-list">
                <li>
                  Pi, X., Yang, Q., &amp; Nguyen, C. (2025). LOGOS: LLM-driven end-to-end grounded theory development and
                  schema induction for qualitative research [Preprint]. arXiv.{" "}
                  <a href="https://arxiv.org/abs/2509.24294" target="_blank" rel="noopener noreferrer">
                    https://arxiv.org/abs/2509.24294
                  </a>
                </li>
                <li>
                  Meng, H., Lyu, Q., Qin, P., Yang, Y., Zhang, R., Lin, W.-C., &amp; Lee, Y.-C. (2026). Designing
                  computational tools for exploring causal relationships in qualitative data [Preprint]. arXiv.{" "}
                  <a href="https://arxiv.org/abs/2602.06506" target="_blank" rel="noopener noreferrer">
                    https://arxiv.org/abs/2602.06506
                  </a>
                </li>
                <li>
                  Ornelas, T., Araújo, A. A., Araújo, J., Araújo, M., Trinkenreich, B., &amp; Kalinowski, M. (2025).
                  LLM-assisted thematic analysis: Opportunities, limitations, and recommendations [Preprint]. arXiv.{" "}
                  <a href="https://doi.org/10.48550/arXiv.2511.14528" target="_blank" rel="noopener noreferrer">
                    https://doi.org/10.48550/arXiv.2511.14528
                  </a>
                </li>
                <li>
                  Qiao, T., Walker, C., Cunningham, C. W., &amp; Koh, Y. S. (2025). Thematic-LM: A LLM-based multi-agent
                  system for large-scale thematic analysis. In Proceedings of the ACM Web Conference 2025. OpenReview.{" "}
                  <a href="https://openreview.net/forum?id=jiv0Gl6sto" target="_blank" rel="noopener noreferrer">
                    https://openreview.net/forum?id=jiv0Gl6sto
                  </a>
                </li>
                <li>
                  Kiger, M. E., &amp; Varpio, L. (2020). Thematic analysis of qualitative data: AMEE Guide No. 131.{" "}
                  <em>Medical Teacher</em>, 42(8), 846–854.{" "}
                  <a href="https://doi.org/10.1080/0142159X.2020.1755030" target="_blank" rel="noopener noreferrer">
                    https://doi.org/10.1080/0142159X.2020.1755030
                  </a>
                </li>
                <li>
                  Tie, Y. C., Birks, M., &amp; Francis, K. (2019). Grounded theory research: A design framework for novice
                  researchers. <em>SAGE Open Medicine</em>, 7.{" "}
                  <a href="https://doi.org/10.1177/2050312118822927" target="_blank" rel="noopener noreferrer">
                    https://doi.org/10.1177/2050312118822927
                  </a>
                </li>
                <li>
                  Chapman, A. L., Hadfield, M., &amp; Chapman, C. J. (2015). Qualitative research in healthcare: An
                  introduction to grounded theory using thematic analysis. <em>Journal of the Royal College of Physicians
                  of Edinburgh</em>, 45(3), 201–205.{" "}
                  <a href="https://doi.org/10.4997/jrcpe.2015.305" target="_blank" rel="noopener noreferrer">
                    https://doi.org/10.4997/jrcpe.2015.305
                  </a>
                </li>
              </ol>
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

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PipelineView } from "./PipelineView";

/** Edit these for your defense / portfolio slide deck. */
const PRESENTATION = {
  title: "LLM-Guided Grounded Thematic Analysis at Scale",
  author: "Nima Motieifard",
} as const;

const SECTION_COUNT = 6;

const SECTION_LABELS = [
  "Overview",
  "Background",
  "Focus",
  "My work",
  "Pipeline",
  "Future",
] as const;

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
          Labels sit in each circle’s outer lobe (mostly non-overlap region):
          top = CS, lower-left = computational social science, lower-right = linguistics.
        */}
        <text
          x={top.x}
          y={top.y - 46}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          Computer
        </text>
        <text
          x={top.x}
          y={top.y - 30}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          science
        </text>

        <text
          x={left.x - 38}
          y={left.y - 8}
          textAnchor="middle"
          className="research-venn-label"
          filter={`url(#${p}-label-shadow)`}
        >
          Computational
        </text>
        <text
          x={left.x - 38}
          y={left.y + 10}
          textAnchor="middle"
          className="research-venn-label research-venn-label--small"
          filter={`url(#${p}-label-shadow)`}
        >
          social science
        </text>

        <text
          x={right.x + 40}
          y={right.y + 2}
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

function MyWorkFlow() {
  return (
    <div className="research-workflow" aria-label="Inputs to outputs">
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
              <p className="research-kicker">Research overview</p>
              <h1 id="research-slide-0-title" className="research-title">
                {PRESENTATION.title}
              </h1>
              <p className="research-author">{PRESENTATION.author}</p>
            </div>
            <div className="research-hero-vis">
              <IntersectionVenn />
            </div>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-1-title">
          <div className="research-slide-inner">
            <h2 id="research-slide-1-title" className="research-h2">
              Background
            </h2>
            <p className="research-lead">
              Purpose of this project is to{" "}
              <strong>
                develop and evaluate an LLM-based agent workflow for extracting and organizing information from text
              </strong>
              , supporting insight generation with <strong>minimal surrounding context</strong>.
            </p>
            <p className="research-body">
              Qualitative researchers routinely work with large text collections; manual thematic analysis does not
              scale. This work asks how far automated agents can carry out grounded, transparent coding and structuring
              while remaining accountable to a stated research question.
            </p>
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-2-title">
          <div className="research-slide-inner research-slide-inner--focus">
            <h2 id="research-slide-2-title" className="research-h2">
              Focus
            </h2>
            <div className="research-two-col">
              <div>
                <h3 className="research-h3">Thematic analysis</h3>
                <p className="research-body">
                  A family of approaches for identifying, analyzing, and reporting patterns (themes) across qualitative
                  data. Themes capture shared meaning relevant to the research question and are typically illustrated
                  with data extracts.
                </p>
              </div>
              <div>
                <h3 className="research-h3">Grounded theory (GT)</h3>
                <p className="research-body">
                  An inductive methodology for building theory from data. In social science it is widely used to study
                  human behavior and social dynamics—often at scale when texts (interviews, posts, reviews) stand in for
                  field notes.
                </p>
              </div>
            </div>
            <h3 className="research-h3 research-h3--spaced">Typical GT coding trajectory</h3>
            <GroundedTheorySteps />
          </div>
        </section>

        <section className="research-slide" aria-labelledby="research-slide-3-title">
          <div className="research-slide-inner">
            <h2 id="research-slide-3-title" className="research-h2">
              My work
            </h2>
            <p className="research-lead">End-to-end flow from your corpus to structured outputs and a report.</p>
            <MyWorkFlow />
          </div>
        </section>

        <section className="research-slide research-slide--pipeline" aria-labelledby="research-slide-4-title">
          <h2 id="research-slide-4-title" className="research-visually-hidden">
            Pipeline in detail
          </h2>
          <PipelineView isDark={isDark} presentationEmbed />
        </section>

        <section className="research-slide" aria-labelledby="research-slide-5-title">
          <div className="research-slide-inner">
            <h2 id="research-slide-5-title" className="research-h2">
              Future improvements
            </h2>
            <ul className="research-future-list">
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

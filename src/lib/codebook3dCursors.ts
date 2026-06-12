export type Codebook3DCursorMode = "orbit" | "grabbing" | "node";

function svgDataUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function cursor(svg: string, hx: number, hy: number, fallback: string): string {
  return `${svgDataUrl(svg)} ${hx} ${hy}, ${fallback}`;
}

/** Orbit-themed cursors for the codebook 3D map (dark / light canvas backgrounds). */
export function codebook3dCursors(isDark: boolean) {
  const accent = isDark ? "#7cf0d0" : "#009980";
  const accentSoft = isDark ? "rgba(124,240,208,0.22)" : "rgba(0,153,128,0.2)";
  const violet = isDark ? "#a78bfa" : "#6b4fc9";
  const ring = isDark ? "rgba(255,255,255,0.35)" : "rgba(15,23,42,0.35)";

  const orbit = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="9" stroke="${ring}" stroke-width="1" opacity="0.8"/>
    <circle cx="14" cy="14" r="6.5" stroke="${accent}" stroke-width="1.35" stroke-dasharray="3.5 2.5" stroke-linecap="round"/>
    <circle cx="14" cy="14" r="2.2" fill="${accent}"/>
    <path d="M14 3.5v2.8M14 21.7v2.8M3.5 14h2.8M21.7 14h2.8" stroke="${violet}" stroke-width="1.25" stroke-linecap="round" opacity="0.85"/>
    <path d="M6.2 6.2l2 2M19.8 19.8l2 2M19.8 6.2l-2 2M8.2 19.8l-2 2" stroke="${violet}" stroke-width="1" stroke-linecap="round" opacity="0.45"/>
  </svg>`;

  const grabbing = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="9" stroke="${accent}" stroke-width="2" opacity="0.95"/>
    <circle cx="14" cy="14" r="3" fill="${accent}"/>
    <path d="M5.5 9.5c1.8-3.2 5.2-5 8.5-5s6.7 1.8 8.5 5" stroke="${violet}" stroke-width="1.35" stroke-linecap="round"/>
    <path d="M5.5 18.5c1.8 3.2 5.2 5 8.5 5s6.7-1.8 8.5-5" stroke="${violet}" stroke-width="1.35" stroke-linecap="round"/>
  </svg>`;

  const node = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="10" fill="${accentSoft}" stroke="${accent}" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="4.5" fill="${accent}" stroke="${isDark ? "#0a0c12" : "#fff"}" stroke-width="1"/>
    <circle cx="14" cy="14" r="1.2" fill="${isDark ? "#0a0c12" : "#fff"}"/>
  </svg>`;

  return {
    orbit: cursor(orbit, 14, 14, "grab"),
    grabbing: cursor(grabbing, 14, 14, "grabbing"),
    node: cursor(node, 14, 14, "pointer"),
  } as const;
}

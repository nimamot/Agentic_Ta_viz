export const FOCUS_TRANSITION_MS = 850;

const CROSSFADE_START = 0.08;
const CROSSFADE_END = 0.44;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Overview map opacity — symmetric crossfade with the focus layer (enter and exit). */
export function overviewLayerOpacity(blend: number): number {
  return 1 - smoothstep(CROSSFADE_START, CROSSFADE_END, blend);
}

export function focusLayerOpacity(blend: number): number {
  return smoothstep(CROSSFADE_START, CROSSFADE_END, blend);
}

export function focusLayerScale(blend: number): number {
  if (blend < 0.05) return 0.001;
  return 0.1 + 0.9 * easeInOutCubic(smoothstep(0.05, 0.92, blend));
}

export function isFocusInteractionEnabled(blend: number): boolean {
  return blend <= 0.08 || blend >= 0.88;
}

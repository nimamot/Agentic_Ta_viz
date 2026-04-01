import { GRAPH_CLUSTER_HEXES } from "./graphBuilder";

export type BranchLevelStyle = {
  bg: string;
  border: string;
  hoverBg: string;
  hoverBorder: string;
  label: string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 99, g: 115, b: 255 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function accentHueSaturation(branchIndex: number): { h: number; s: number } {
  const hex = GRAPH_CLUSTER_HEXES[branchIndex % GRAPH_CLUSTER_HEXES.length]!;
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

/**
 * Node chrome for one branch (top-level subtree) and tree depth.
 * `muted` matches the UI “Clusters” off state — softer saturation.
 */
export function branchLevelStyle(
  branchIndex: number,
  depth: number,
  theme: "dark" | "light",
  muted: boolean
): BranchLevelStyle {
  let { h, s } = accentHueSaturation(branchIndex);
  if (muted) s = Math.max(26, s * 0.5);
  const d = depth % 8;
  if (theme === "dark") {
    const sat = Math.max(42, Math.min(92, s * 0.88 + 5));
    const sat2 = Math.min(98, sat + 12);
    const bgL = 45 - d * 3.4;
    const hoverL = bgL + 9;
    const borderL = Math.min(84, 56 + d * 2.4);
    return {
      bg: `hsla(${h}, ${sat}%, ${bgL}%, ${0.48 + Math.min(0.12, d * 0.014)})`,
      border: `hsla(${h}, ${sat2}%, ${borderL}%, 0.9)`,
      hoverBg: `hsla(${h}, ${sat}%, ${hoverL}%, ${0.58 + Math.min(0.09, d * 0.012)})`,
      hoverBorder: `hsla(${h}, ${sat2}%, ${Math.min(92, borderL + 5)}%, 0.97)`,
      label: `hsla(${h}, 14%, 96%, 0.94)`,
    };
  }
  const sat = Math.max(44, Math.min(86, s * 0.82));
  const bgL = 36 + d * 2.6;
  const hoverL = Math.min(44, bgL + 5);
  const borderL = Math.max(20, 32 - d * 2);
  return {
    bg: `hsla(${h}, ${sat}%, ${bgL}%, ${0.4 + d * 0.022})`,
    border: `hsla(${h}, ${Math.min(96, sat + 6)}%, ${borderL}%, 0.9)`,
    hoverBg: `hsla(${h}, ${sat}%, ${hoverL}%, 0.5)`,
    hoverBorder: `hsla(${h}, ${Math.min(96, sat + 10)}%, ${Math.max(16, borderL - 3)}%, 0.94)`,
    label: `hsla(${h}, 38%, 11%, 0.93)`,
  };
}

export function treeEdgeColors(
  branchIndex: number,
  emphasized: boolean,
  isDark: boolean,
  muted: boolean
): { color: string; highlight: string; hover: string } {
  let { h, s } = accentHueSaturation(branchIndex);
  if (muted) s = Math.max(22, s * 0.46);
  const sat = Math.min(100, s + (emphasized ? 10 : 0));
  const l = emphasized ? (isDark ? 74 : 36) : isDark ? 56 : 40;
  const a = emphasized ? 0.86 : isDark ? 0.36 : 0.4;
  const c = `hsla(${h}, ${sat}%, ${l}%, ${a})`;
  const glow = `hsla(${h}, ${Math.min(100, sat + 8)}%, ${isDark ? 80 : 44}%, 0.94)`;
  return { color: c, highlight: glow, hover: glow };
}

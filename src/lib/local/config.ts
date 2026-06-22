/** Root URL for local data (Vite serves `public/` at `/`). */
export function getLocalDataRoot(): string {
  const custom = import.meta.env.VITE_LOCAL_DATA_ROOT?.trim();
  const base = custom || "/data";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function projectDir(slug: string): string {
  return `${getLocalDataRoot()}/projects/${encodeURIComponent(slug)}`;
}

export function reviewDir(slug: string): string {
  return `${getLocalDataRoot()}/codebook-reviews/${encodeURIComponent(slug)}`;
}

import type { ResearchProjectRow } from "../../types";
import { projectDir } from "./config";
import {
  fetchFirstJson,
  fetchFirstText,
  fetchJsonFile,
  fetchRequiredJson,
  fetchRequiredText,
} from "./fetchFiles";
import type { LocalManifest, LocalProjectMeta } from "./types";

const GLOBAL_GRAPH_FILES = ["gt_global_graph.json", "global_graph.json"];
const REPORT_FILES = ["research_report.md", "report.md", "report_markdown.md"];
const OPEN_CODES_FILES = ["gt_open_codes_all_reviews.md", "open_codes.md", "open_codes_markdown.md"];
const COOCCURRENCE_FILES = ["cooccurrence.json"];

function resolveProjectMeta(folder: string, meta: LocalProjectMeta | null): LocalProjectMeta {
  const slug = meta?.slug?.trim() || folder;
  const id = meta?.id?.trim() || slug;
  return {
    id,
    slug,
    research_question: meta?.research_question ?? null,
    created_at: meta?.created_at ?? new Date(0).toISOString(),
  };
}

async function loadProjectFromFolder(folder: string): Promise<ResearchProjectRow> {
  const dir = projectDir(folder);
  const meta =
    (await fetchFirstJson<LocalProjectMeta>(dir, ["meta.json"], `Project ${folder} meta`)) ?? {};

  const resolved = resolveProjectMeta(folder, meta);
  const global_graph = await fetchRequiredJson<unknown>(
    dir,
    GLOBAL_GRAPH_FILES,
    `Project ${folder} global graph`
  );
  const report_markdown = await fetchRequiredText(dir, REPORT_FILES, `Project ${folder} report`);
  const open_codes_markdown = await fetchFirstText(
    dir,
    OPEN_CODES_FILES,
    `Project ${folder} open codes`
  );
  const cooccurrence = await fetchFirstJson<unknown>(
    dir,
    COOCCURRENCE_FILES,
    `Project ${folder} cooccurrence`
  );

  return {
    id: resolved.id!,
    slug: resolved.slug!,
    research_question: resolved.research_question ?? null,
    codebook: null,
    global_graph,
    report_markdown,
    open_codes_markdown,
    cooccurrence: cooccurrence ?? null,
    meta: null,
    created_at: resolved.created_at!,
  };
}

export async function fetchLocalManifest(): Promise<LocalManifest> {
  const root = import.meta.env.VITE_LOCAL_DATA_ROOT?.trim() || "/data";
  const url = `${root.endsWith("/") ? root.slice(0, -1) : root}/manifest.json`;
  try {
    return await fetchJsonFile<LocalManifest>(url, "data manifest");
  } catch {
    return { projects: [], codebook_reviews: [] };
  }
}

export async function fetchLocalResearchProjects(): Promise<ResearchProjectRow[]> {
  const manifest = await fetchLocalManifest();
  const folders = manifest.projects ?? [];
  const rows: ResearchProjectRow[] = [];
  const errors: string[] = [];

  for (const folder of folders) {
    try {
      rows.push(await loadProjectFromFolder(folder));
    } catch (e) {
      errors.push(`${folder}: ${(e as Error).message}`);
    }
  }

  if (errors.length > 0 && rows.length === 0) {
    throw new Error(errors.join("\n"));
  }

  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows;
}

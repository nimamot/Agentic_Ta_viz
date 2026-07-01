import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const DATA_ROOT = path.join(process.cwd(), "public", "data");
const SUBMIT_PATH = "/api/local/codebook-review/submit";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function safeSlug(slug: string): string | null {
  const s = slug.trim();
  if (!s || !/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

function reviewFolder(slug: string): string {
  const folder = path.join(DATA_ROOT, "codebook-reviews", slug);
  const resolved = path.resolve(folder);
  const reviewsRoot = path.resolve(DATA_ROOT, "codebook-reviews");
  if (!resolved.startsWith(reviewsRoot + path.sep) && resolved !== reviewsRoot) {
    throw new Error("Invalid review path");
  }
  return resolved;
}

async function handleSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    sendJson(res, 400, { error: "Invalid payload" });
    return;
  }

  const body = parsed as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? safeSlug(body.slug) : null;
  const status = body.status;
  if (!slug) {
    sendJson(res, 400, { error: "Missing or invalid slug" });
    return;
  }
  if (status !== "approved" && status !== "cancelled") {
    sendJson(res, 400, { error: "status must be approved or cancelled" });
    return;
  }

  const dir = reviewFolder(slug);
  if (!fs.existsSync(dir)) {
    sendJson(res, 404, { error: `Review folder not found: ${slug}` });
    return;
  }

  const now = new Date().toISOString();
  const metaPath = path.join(dir, "meta.json");
  let meta: Record<string, unknown> = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    } catch {
      sendJson(res, 500, { error: "meta.json is not valid JSON" });
      return;
    }
  }

  if (status === "approved") {
    if (body.codebook_v2 == null) {
      sendJson(res, 400, { error: "codebook_v2 is required for approval" });
      return;
    }
    fs.writeFileSync(
      path.join(dir, "codebook_v2.json"),
      `${JSON.stringify(body.codebook_v2, null, 2)}\n`,
      "utf8"
    );
    meta.status = "approved";
    meta.approved_at = now;
    meta.updated_at = now;
  } else {
    meta.status = "cancelled";
    meta.cancelled_at = now;
    meta.updated_at = now;
  }

  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  sendJson(res, 200, { ok: true, slug, status });
}

/** Dev-only API — writes approved codebooks to public/data/ (local researchers). */
export function localDataApiPlugin(): Plugin {
  return {
    name: "local-data-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== SUBMIT_PATH || req.method !== "POST") {
          next();
          return;
        }
        void handleSubmit(req, res).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Submit failed";
          sendJson(res, 500, { error: message });
        });
      });
    },
  };
}

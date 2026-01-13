/**
 * Semantic layer file map (repo -> just-bash VFS)
 *
 * Reads the checked-in `semantic-layer/` directory and materializes it into a
 * flat file map that can be mounted into just-bash's in-memory filesystem.
 *
 * Mount point in VFS: `/semantic-layer/...`
 */

import { readdir, readFile, stat } from "fs/promises";
import path from "path";

export type VfsFileMap = Record<string, string>;

let cached: VfsFileMap | null = null;
let cachedFromDir: string | null = null;

function getSemanticLayerDir(): string {
  const override = process.env.SEMANTIC_LAYER_DIR;
  if (override) return override;
  // Default: repo root / semantic-layer
  return path.resolve(process.cwd(), "semantic-layer");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export async function getSemanticLayerFileMap(): Promise<VfsFileMap> {
  const dir = getSemanticLayerDir();
  if (cached && cachedFromDir === dir) {
    return cached;
  }

  // If semantic-layer dir doesn't exist, mount only placeholders.
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) {
      cached = {
        "/semantic-layer/.keep": "",
      };
      cachedFromDir = dir;
      return cached;
    }
  } catch {
    cached = {
      "/semantic-layer/.keep": "",
    };
    cachedFromDir = dir;
    return cached;
  }

  const files = await walk(dir);
  const map: VfsFileMap = {
    "/semantic-layer/.keep": "",
  };

  for (const abs of files) {
    const rel = path.relative(dir, abs).split(path.sep).join("/");
    const vfsPath = `/semantic-layer/${rel}`;
    try {
      map[vfsPath] = await readFile(abs, "utf8");
    } catch (err) {
      console.debug(`[semantic-layer] Failed to read ${abs}:`, err);
    }
  }

  cached = map;
  cachedFromDir = dir;
  return map;
}


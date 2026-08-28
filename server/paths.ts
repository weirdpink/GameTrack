import path from "path";
import fs from "fs";

// Works in dev (tsx provides __dirname), the esbuild CJS bundle (native __dirname),
// and container/node execution without build warnings.
const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.join(process.cwd(), "server");

/**
 * Project root, derived from this file's location. Works identically in
 * development (tsx running from `server/`) and production (esbuild bundle
 * emitted into `dist-server/`), so the app never depends on process.cwd().
 */
export const ROOT_DIR = path.resolve(HERE, "..");

/** Data directory — override with GAMETRACK_DATA_DIR (e.g. container volumes). */
export const DATA_DIR = process.env.GAMETRACK_DATA_DIR
  ? path.resolve(process.env.GAMETRACK_DATA_DIR)
  : path.join(ROOT_DIR, "data");

export const POSTERS_DIR = path.join(DATA_DIR, "posters");

/** Compiled frontend assets. */
export const DIST_DIR = path.join(ROOT_DIR, "dist");

/** Ensure the data directory exists with restricted permissions. */
export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  } else {
    fs.chmodSync(DATA_DIR, 0o700);
  }
}

#!/usr/bin/env node
/**
 * Build guard for `npm start`: rebuild the production bundle when it is
 * missing OR stale. A freshly-cloned repo, a git pull, or an edit to the
 * server sources must never serve an outdated bundle from dist-server/.
 */
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "dist-server", "server.cjs");

if (!existsSync(out)) {
  console.log("[ensure-build] server bundle missing — building…");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
  process.exit(0);
}

const outTime = statSync(out).mtimeMs;
const sources = [
  "server.ts",
  "server/routes.ts",
  "server/db.ts",
  "server/igdb.ts",
  "server/steam.ts",
  "server/paths.ts",
];
const stale = sources.some((f) => {
  const p = join(root, f);
  return existsSync(p) && statSync(p).mtimeMs > outTime;
});

if (stale) {
  console.log("[ensure-build] server bundle is stale — rebuilding…");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
} else {
  console.log("[ensure-build] server bundle is up to date.");
}
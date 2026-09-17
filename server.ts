import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { apiRouter, runSteamSyncInternal } from "./server/routes";
import db from "./server/db";
import { DIST_DIR, POSTERS_DIR, ensureDataDir } from "./server/paths";

const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "127.0.0.1";

// A shared secret enables a lightweight bearer-token gate on all /api routes.
// When unset, the server trusts loopback access (single-user local mode).
const API_TOKEN = (process.env.API_TOKEN || "").trim();

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

// Fail-closed: never bind to a non-loopback interface without a token.
// Otherwise any host that can reach the server gains full read/write/wipe.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "::"]);
if (!API_TOKEN && HOST !== "127.0.0.1" && !LOOPBACK_HOSTS.has(HOST)) {
  console.error(
    "Refusing to start: binding to a non-loopback host requires API_TOKEN. " +
      "Set API_TOKEN in the environment (and pass it with every request) to expose the server."
  );
  process.exit(1);
}

ensureDataDir();

const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  ...(HOST !== "127.0.0.1" && HOST !== "localhost" ? [`http://${HOST}:${PORT}`] : []),
  // Explicit allowlist for deployment behind a real hostname/port.
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean),
]);

function tokenMatches(supplied: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(API_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Connected SSE browsers listening for sync notifications.
const syncClients = new Set<Response>();

/**
 * Build the express app without binding a port — used by the real server
 * (startServer) and by supertest in the API smoke tests. `production` skips
 * the Vite dev middleware and enables the strict CSP.
 */
export async function createApp(production = false) {
  const IS_PRODUCTION = production;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: IS_PRODUCTION
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: [
                "'self'",
                "data:",
                "https://images.igdb.com",
                "https://images.unsplash.com",
                "https://shared.cloudflare.steamstatic.com",
                "https://cdn.akamai.steamstatic.com",
                "https://cdn.cloudflare.steamstatic.com",
                "https://avatars.steamstatic.com",
                "https://avatars.akamai.steamstatic.com",
              ],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              // Inline pre-paint scripts (theme + boot watchdog) are allowlisted
              // by content hash — strict 'self' otherwise.
              scriptSrc: [
                "'self'",
                "'sha256-IfX3zdfWtflM4c5LI8bjvAslWdZSg+McvPC4zV9NcKo='",
                "'sha256-VoY+16A4k/+tlxh36bABOBpkr6Zc2BX99Nr1ZRvLlU4='",
              ],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // ── CSRF / origin protection ─────────────────────────────────────
  // State-changing requests from a browser always carry an Origin header.
  // Reject requests that are missing it or come from a non-allowlisted
  // origin (also covers the DNS-rebinding + prefix-confusion cases). Runs
  // before CORS so blocked requests return a clean 403, never a 500.
  const stateChanging = ["POST", "PUT", "DELETE"];
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!stateChanging.includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return res.status(403).json({ error: "Forbidden: Invalid request origin." });
    }
    next();
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin requests (no Origin header) are allowed; foreign origins
        // pass through WITHOUT CORS headers — the browser then drops the
        // response. (State-changing foreign requests never get this far.)
        callback(null, !origin || ALLOWED_ORIGINS.has(origin));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    })
  );

  app.use(compression());

  // ── Server-Sent Events — live sync notifications for connected browsers ──
  // Registered before the API auth gate so the browser can subscribe without
  // a token; it only carries sync status, never sensitive data.
  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(": connected\n\n");
    syncClients.add(res);
    req.on("close", () => syncClients.delete(res));
  });

  // SSE heartbeat — keeps idle connections alive through proxies so the
  // EventSource never silently dies between 5-minute sync events.
  const sseHeartbeat = setInterval(() => {
    if (syncClients.size === 0) return;
    for (const res of syncClients) {
      try {
        res.write(": ping\n\n");
      } catch {
        /* client gone */
      }
    }
  }, 25_000);
  sseHeartbeat.unref();

  // ── Bearer-token auth gate (optional, disabled in local mode) ────
  if (API_TOKEN) {
    app.use("/api", (req: Request, res: Response, next: NextFunction) => {
      const header = req.headers.authorization || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!supplied || !tokenMatches(supplied)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    });
  }

  // Bigger per-route body limits: library imports and base64 poster uploads
  // legitimately exceed the default 1mb. These MUST be mounted before the
  // global parser — express parses the body on the first matching middleware,
  // so a 1mb global parser mounted first would 413 every large import/upload.
  app.use("/api/import", express.json({ limit: "25mb" }));
  app.use("/api/upload-poster", express.json({ limit: "4mb" }));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // ── Request logging (access log) ─────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      if (req.path.startsWith("/api")) {
        console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
      }
    });
    next();
  });

  // ── Rate limiting (API only — static assets stay unlimited) ──────
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api", apiLimiter);

  const strictLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests to this endpoint, please slow down." },
  });
  app.use("/api/discover", strictLimiter);

  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many uploads, please slow down." },
  });
  app.use("/api/upload-poster", uploadLimiter);

  const syncLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Steam sync is already running or too frequent." },
  });
  app.use("/api/sync/steam", syncLimiter);

  // Steam-link attempts burn upstream Steam Web API calls — throttle hard
  // to keep the per-key quota safe and prevent profile-existence probing.
  // Scoped to PUT only: the frontend fires GET /api/settings/steam on every
  // Settings open, which must not consume link-attempt quota.
  const steamLinkLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Steam link attempts, please slow down." },
  });
  app.put("/api/settings/steam", steamLinkLimiter);

  // No-cache headers for all API responses
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  });

  app.use("/api", apiRouter);

  // JSON 404 for unknown API routes — before the Vite/SPA fallback so dev
  // mode returns the same shape as production instead of an HTML 200.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "API Route Not Found" });
  });

  // Serve locally uploaded custom posters from the data directory
  app.use(
    "/posters",
    express.static(POSTERS_DIR, {
      maxAge: "30d",
      etag: true,
      fallthrough: true,
    })
  );

  if (!IS_PRODUCTION) {
    console.log("Starting in DEVELOPMENT mode with Vite Middleware...");
    // Lazy-load Vite only in dev so the production bundle (e.g. Docker's
    // --omit=dev install) never has to resolve the devDependency.
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
        // The app writes the sqlite DB (and profile.json) into data/ all the
        // time — watching it would make Vite full-reload the page on every
        // write. Build outputs must be ignored for the same reason.
        watch: { ignored: ["**/data/**", "**/dist/**", "**/dist-server/**", "**/*.tsbuildinfo"] },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode...");
    // Hashed assets (immutable) — everything else falls through to the SPA handler.
    app.use(
      "/assets",
      express.static(path.join(DIST_DIR, "assets"), {
        maxAge: "1y",
        immutable: true,
        etag: true,
      })
    );
    // Top-level static files (favicon, robots.txt, ...) — short cache.
    app.use(express.static(DIST_DIR, { index: false, maxAge: "1h", etag: true }));

    // SPA fallback: only for extensionless, HTML-accepting navigation requests.
    app.get("*", (req: Request, res: Response) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API Route Not Found" });
      }
      const hasExtension = path.extname(req.path) !== "";
      if (hasExtension || !req.accepts("html")) {
        return res.status(404).send("Not Found");
      }
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(DIST_DIR, "index.html"));
    });
  }

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const errorObj = err as Record<string, unknown> | undefined;
    const errorMessage = err instanceof Error ? err.message : String(err || "Request failed");
    console.error("Global Error Handler:", errorMessage);
    if (errorObj?.type === "entity.too.large") {
      return res.status(413).json({ error: "Request payload too large" });
    }
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    const status = typeof errorObj?.status === "number" && Number.isInteger(errorObj.status) ? errorObj.status : 500;
    res.status(status).json({ error: status >= 500 ? "Internal Server Error" : errorMessage });
  });

  return app;
}

// ── Background Steam Sync ──────────────────────────────────────────
const STEAM_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let steamSyncInterval: ReturnType<typeof setInterval> | null = null;

// The in-flight background sync (if any) so shutdown can wait for it instead
// of closing the DB underneath a live transaction.
let inFlightSync: Promise<void> | null = null;

function emitSyncEvent(payload: Record<string, unknown>) {
  const frame = `event: steam-sync\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of syncClients) {
    try {
      res.write(frame);
    } catch {
      /* client gone */
    }
  }
}

async function runBackgroundSync() {
  try {
    emitSyncEvent({ status: "started" });
    console.log("[Background Sync] Starting Steam sync...");
    const result = await runSteamSyncInternal();
    emitSyncEvent({
      status: "complete",
      imported: result.imported,
      updated: result.updated,
      adopted: result.adopted,
      total: result.total,
    });
    console.log(
      `[Background Sync] Steam sync complete — imported: ${result.imported}, updated: ${result.updated}, adopted: ${result.adopted}, total: ${result.total}`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Not-connected or already-running are expected; don't spam the log.
    if (msg.includes("not connected") || msg.includes("already running")) {
      emitSyncEvent({ status: "skipped", reason: msg });
      console.log(`[Background Sync] Skipped: ${msg}`);
    } else if (
      msg.includes("unreachable") ||
      msg.includes("offline") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("fetch failed") ||
      msg.includes("timed out")
    ) {
      emitSyncEvent({ status: "failed", reason: "Steam API unreachable (offline)" });
      console.log(`[Background Sync] Skipped: Network offline or Steam API unreachable`);
    } else {
      emitSyncEvent({ status: "failed", reason: msg || "Unknown error" });
      console.error(`[Background Sync] Steam sync failed: ${msg}`);
    }
  }
}

function scheduleBackgroundSync() {
  inFlightSync = runBackgroundSync().finally(() => {
    inFlightSync = null;
  });
}

function startBackgroundSteamSync() {
  // Trigger initial Steam sync immediately on startup (1s delay to let server initialize)
  setTimeout(() => {
    scheduleBackgroundSync();
  }, 1_000);

  steamSyncInterval = setInterval(scheduleBackgroundSync, STEAM_SYNC_INTERVAL_MS);
  console.log(`[Background Sync] Scheduled every ${STEAM_SYNC_INTERVAL_MS / 60_000} minutes.`);
}

async function startServer() {
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  const app = await createApp(IS_PRODUCTION);

  const server = app.listen(PORT, HOST, () => {
    console.log(`GameTrack server running on http://${HOST}:${PORT}${API_TOKEN ? " (API token auth enabled)" : ""}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });

  // Start background Steam sync (runs once on startup, then every 5 min)
  startBackgroundSteamSync();

  // Graceful shutdown: let active requests finish before exiting.
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    if (steamSyncInterval) {
      clearInterval(steamSyncInterval);
      steamSyncInterval = null;
      console.log("[Background Sync] Stopped.");
    }
    // EventSource connections never close on their own — end them first or
    // server.close() hangs forever waiting on open sockets.
    for (const res of syncClients) {
      try {
        res.end();
      } catch { /* already gone */ }
    }
    syncClients.clear();
    if (inFlightSync) {
      console.log("[Background Sync] Waiting for in-flight sync to finish...");
      await Promise.race([
        inFlightSync,
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
      console.log("[Background Sync] In-flight sync settled.");
    }
    server.close(() => {
      console.log("Server closed.");
      db.close();
      console.log("Database connection closed. Exiting.");
      process.exit(0);
    });
    // Force exit after 10s if connections refuse to drain.
    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Tests import this module to build an app via createApp() — never start the
// real listener (or schedule real Steam/IGDB calls) inside the test process.
if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

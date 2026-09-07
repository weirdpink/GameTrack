# 🎮 GAMETRACK_

> **A Personal Gaming Registry & Metric Analyzer.** Catalogue your collection, log playtime with precision, sync from Steam, discover new titles through IGDB, and inspect deep analytics — all rendered in a raw industrial-cyberpunk interface. Local-first, fully offline-capable, zero cloud dependency.

GameTrack is a full-stack, single-user desktop-style web application built for gamers who treat their library like a database. It combines a **local SQLite registry**, **Steam library sync**, **IGDB discovery**, and a **telemetry dashboard** into one cohesive app with a brutalist, terminal-inspired visual identity.

---

## 📖 Table of Contents

- [Core Philosophy](#-core-philosophy)
- [Screenshots](#-screenshots)
- [Feature Tour](#-feature-tour)
  - [00 — CENTRAL Dashboard](#00--central-dashboard)
  - [01 — LIBRARY Vault](#01--library-vault)
  - [02 — DISCOVER Engine](#02--discover-engine)
  - [03 — ANALYTICS](#03--analytics)
  - [System Configuration](#system-configuration)
- [Technology Stack](#-technology-stack)
- [Data Model](#-data-model)
- [API Reference](#-api-reference)
- [Configuration & Environment](#-configuration--environment)
- [Getting Started](#-getting-started)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Security Notes](#-security-notes)
- [Visual System](#-visual-system)

---

## 🧭 Core Philosophy

1. **Local-first ownership.** Every game, rating, playtime minute and platform tag lives in a single SQLite file under `./data/`. No accounts, no cloud sync, no vendor lock-in. Your library is yours.
2. **Precision telemetry.** Playtime is tracked in decimal hours and aggregated with a calculator's discipline — right down to per-genre share and average session duration.
3. **Honest interfaces.** The UI is deliberately raw: sharp corners, monospace metadata, exposed status channels, no rounded-corners softness, no decorative fluff.
4. **Fast by default.** The frontend is a static bundle served by one small Node process. Analytics views are lazy-loaded so the initial payload stays lean.

---

## 🖼️ Screenshots

> **⚠️ Placeholder section — drop your captures into `screenshots/` and they'll render here automatically.**
> Suggested captures: landing page, dashboard, library grid, filter panel open, discover search, analytics, settings.

<div align="center">
  <img src="screenshots/landing.png" alt="Landing page" width="85%" />
  <br />
  <sub><i>Landing / entry gate — drop at <code>screenshots/landing.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/dashboard.png" alt="Central dashboard" width="85%" />
  <br />
  <sub><i>Dashboard ("CENTRAL") — drop at <code>screenshots/dashboard.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/library.png" alt="Game library grid" width="85%" />
  <br />
  <sub><i>Library grid ("LIBRARY") — drop at <code>screenshots/library.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/library-filters.png" alt="Library with the filter panel expanded" width="85%" />
  <br />
  <sub><i>Library with filters expanded — drop at <code>screenshots/library-filters.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/game-details.png" alt="Game detail modal" width="85%" />
  <br />
  <sub><i>Game detail modal — drop at <code>screenshots/game-details.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/discover.png" alt="Discover engine" width="85%" />
  <br />
  <sub><i>Discover engine ("DISCOVER") — drop at <code>screenshots/discover.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/analytics.png" alt="Analytics viewport" width="85%" />
  <br />
  <sub><i>Analytics viewport ("ANALYTICS") — drop at <code>screenshots/analytics.png</code></i></sub>
</div>

<br />

<div align="center">
  <img src="screenshots/settings.png" alt="System settings modal" width="85%" />
  <br />
  <sub><i>System settings — drop at <code>screenshots/settings.png</code></i></sub>
</div>

---

## ✨ Feature Tour

The app is split into four numbered viewports (plus a full-screen landing gate and a modal-based settings system). Navigation lives in a fixed sidebar on desktop and a hamburger menu on mobile.

### 00 — CENTRAL Dashboard

The mission-control viewport. Everything is computed from the live registry in real time:

- **Telemetry stat cards** — Registered Games, Active Backlog, Completed titles, and Total Playtime, each with aggregate sub-metrics (completion rate, average hours per title).
- **Session control panel** — a high-contrast block showing the currently tracked playing title with accumulated hours and a quick "mark complete" / session controls; when nothing is active it displays a `NO_ACTIVE_SESSION` state.
- **Suggested directives** — a localized recommendation panel that ranks your library by personal ratings, critic scores, completion state, and playtime to suggest what to play next. Includes a **randomize** mode (`isSuggestionsRandom`) that shuffles the directive queue.
- **Recent activity feed** — a linear log of the most recently updated titles (last 30 days), with quick-open game details.

### 01 — LIBRARY Vault

The heart of the app — a dense, filterable grid of your entire collection:

- **Status sectors** — every title belongs to one of four sectors: `backlog`, `playing`, `completed`, `endless` (multiplayer/lifestyle games).
- **Search** — instant client-side title search across the grid.
- **Filter panel** — a collapsible, animated panel with:
  - **Status selector** (only statuses present in your library are offered),
  - **Platform selector** (from the canonical platform list),
  - **Sort order** — Recently Added, Highest Rating, Most Playtime, Alphabetical, and **Custom Order**.
- **Custom Order mode** — drag & drop reordering of the grid. The visible order is live-previewed as you drag, saved automatically on drop (via `PUT /api/games/order`), and survives filters — hidden games keep their relative positions. A hint bar offers **Discard Changes** and **Reset Order**.
- **Detail-rich cards** — hover overlays reveal genre tags and synopsis; completed titles carry a trophy badge; critic scores float top-right; playtime is shown as precise decimal hours (or masked with `—` if you enabled `hide_playtime`).
- **Status border encoding** — each card's accent border color maps to its status sector at a glance.

### 02 — DISCOVER Engine

IGDB-powered title discovery with the philosophy of "search, preview, import in one click":

- **Full-text search** against the IGDB database via secure proxy routes (API credentials never touch the browser).
- **Genre filtering** alongside the query.
- **Trending marquee** — an infinite-scroll feed of currently trending global releases.
- **Curated editorial sections** — horizontal rails of **Recent Top Rated** (best of the last 90 days), **Best of All Time** (highest critical scores), **New Releases**, and **Most Hyped** upcoming titles.
- **Rich previews** — every result card shows cover art, synopsis, genre tags, year, and critic score.
- **One-click import** — add any discovered title straight into your library with metadata intact (poster, genres, synopsis, critic score, IGDB ID for later re-syncs).
- **Duplicate protection** — titles already in the registry are visually flagged and blocked server-side (unique `igdb_id` / `steam_appid` / title constraints).
- **Keyboard shortcut:** press `CMD+K` (or `CTRL+K`) anywhere to jump straight into Discover search.

### 03 — ANALYTICS

A live telemetry suite (lazy-loaded to keep the initial bundle small):

- **Four KPI cards** — Registry Titles, Total Telemetry Hours, Average Unit Duration, and Registry Completion Rate.
- **01 // Genre telemetry share** — a bar chart of playtime hours split by genre.
- **02 // Status distribution** — proportional bars for every status sector with title counts and percentages.
- **03 // Most played titles** — the top titles by tracked hours with relative duration bars.
- **04 // Completion timeline** — a monthly bar chart of completed titles, plus a **Completed Registry roster** listing your finished games with their completion dates. Completion dates are auto-stamped the moment a title transitions to `completed` (or when imported already-completed from Steam).

### System Configuration

Opened from the gear icon (sidebar, dashboard header, or library header):

- **Steam integration** —
  - Paste your Steam profile URL and API key to link your account (avatar, name, and ID appear in the sidebar).
  - **Sync Steam library** on demand: owned titles are imported with playtime and platform tags; matches on existing entries merge playtime and adopt the Steam ID; duplicates are skipped; your manual ratings, posters and synopses are always preserved.
- **Backup & portability** —
  - **Export** the full registry as a downloadable JSON payload (round-trips perfectly with import).
  - **Import** a GameTrack JSON file to restore or merge a library.
  - **Wipe** the entire database, guarded by a `WIPE` confirmation input — there is no undo.
- **Custom posters** — upload cover art from your machine (server validates real image magic bytes, so HTML/spoofed payloads are rejected).

---

## 🛠️ Technology Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite 6 |
| **Styling** | Tailwind CSS 4 (utility-first, custom `--brand-*` theme tokens) |
| **Motion** | Motion (Framer Motion 12) for viewport transitions, modal entrances, and the filter panel collapse |
| **Charts** | Recharts 3 (genre share, completion timeline) |
| **State** | Zustand 5 with `useShallow` selectors |
| **Icons** | Lucide React |
| **Backend** | Node.js, Express 4, TypeScript run via `tsx` (dev) / bundled with `esbuild` (prod) |
| **Database** | SQLite via `better-sqlite3` — synchronous, zero-config, file-based |
| **Validation** | Zod 4 (request schemas shared between client and server) |
| **Security** | Helmet (CSP), CORS allow-listing, CSRF origin checks, express-rate-limit, optional bearer-token gate |
| **Integrations** | IGDB API (discovery), Steam Web API (library sync) |
| **Testing** | Vitest, supertest (API smoke tests), @testing-library/react (render tests) |

---

## 🗄️ Data Model

A single `games` table powers everything (plus a `settings` key/value table for Steam config):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER PK | auto-increment |
| `title` | TEXT | trimmed, 1–300 chars |
| `status` | TEXT | `backlog` \| `playing` \| `completed` \| `endless` |
| `year` | INTEGER NULL | release year |
| `igdb_id` | INTEGER NULL | unique — links to IGDB metadata |
| `genres` | JSON TEXT | string array, e.g. `["Action","RPG"]` |
| `synopsis` | TEXT | up to 10,000 chars |
| `poster_url` | TEXT | http(s) URL or local `/posters/...` path |
| `critic_score` | INTEGER NULL | 0–100 |
| `owned_platforms` | JSON TEXT | platform ID array (`pc`, `steam`, `epic`, custom…) |
| `playtime` | REAL | decimal hours |
| `personal_rating` | INTEGER NULL | 0–10 |
| `date_added` | INTEGER | epoch ms |
| `date_completed` | INTEGER NULL | epoch ms — auto-stamped on completion |
| `created_at` / `updated_at` | INTEGER | epoch ms |
| `hide_playtime` | INTEGER | `1` masks playtime in the UI |
| `steam_appid` | INTEGER NULL | unique — used for Steam sync matching |
| `custom_order` | INTEGER NULL | hand-arranged library position |

**Uniqueness:** `igdb_id`, `steam_appid`, and case-insensitive `title` are all enforced at the database level, so imports can never create duplicates.

---

## 🌐 API Reference

All routes live under `/api` and return JSON. State-changing requests require a matching `Origin` header (CSRF protection).

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | DB heartbeat check |
| `GET` | `/api/games` | Full library, ordered by date added |
| `POST` | `/api/games` | Add a title manually (201, 409 on duplicates) |
| `POST` | `/api/games/bulk-delete` | Batch delete games (payload: `{ ids: number[] }`) |
| `PUT` | `/api/games/:id` | Partial update — only sent fields change; status transitions auto-stamp/clear `date_completed` |
| `DELETE` | `/api/games/:id` | Remove a title |
| `PUT` | `/api/games/order` | Persist custom drag-order (payload: full ordered id list) |
| `DELETE` | `/api/games/order` | Reset custom order back to default |
| `GET` | `/api/wishlist` | Full wishlist |
| `POST` | `/api/wishlist` | Add a wishlist entry (201, 409 on duplicates) |
| `POST` | `/api/wishlist/bulk-delete` | Batch remove wishlist entries (payload: `{ ids: number[] }`) |
| `DELETE` | `/api/wishlist/:id` | Remove a single wishlist entry |
| `GET` | `/api/analytics` | Summary, genre share, recent activity (30 days) |
| `GET` | `/api/settings/steam` | Steam identity (never exposes the raw API key) |
| `PUT` | `/api/settings/steam` | Save Steam profile + key |
| `POST` | `/api/sync/steam` | Import/sync Steam library (rate-limited) |
| `POST` | `/api/import` | Import a GameTrack JSON export (max 2000 rows) |
| `GET` | `/api/export` | Download full library as JSON backup |
| `DELETE` | `/api/wipe` | Destroy the entire registry |
| `POST` | `/api/upload-poster` | Upload cover art (magic-byte validated) |
| `GET` | `/api/discover/search` | IGDB search with genre filter |
| `GET` | `/api/discover/game/:igdbId` | Full metadata for one title |
| `GET` | `/api/discover/trending` | Current trending releases |
| `GET` | `/api/discover/lists` | Curated rails: recent top rated, best of all time, new releases, most hyped |

Non-API routes serve the built SPA; unknown `/api/*` routes return JSON 404s.

---

## ⚙️ Configuration & Environment

Copy `.env.example` to `.env` and fill in what you need:

```env
# ── Required for IGDB discovery ─────────────────────────────────
# Get these from the Twitch Developer Portal (IGDB API).
IGDB_CLIENT_ID=your_twitch_client_id_here
IGDB_CLIENT_SECRET=your_twitch_client_secret_here

# ── Steam integration (optional — enables library sync) ─────────
# STEAM_WEB_API_KEY=your_steam_api_key_here

# ── Security (optional) ─────────────────────────────────────────
# When set, every /api request must send `Authorization: Bearer <token>`.
# Recommended if the server is exposed beyond localhost.
# API_TOKEN=change-me

# ── Data & hosting (optional) ───────────────────────────────────
# GAMETRACK_DATA_DIR=/path/to/data   # override default ./data
# PORT=3001
# HOST=127.0.0.1
# NODE_ENV=development
```

> Without IGDB credentials the app still runs — you just won't be able to search Discover or re-sync IGDB metadata. Manual add + Steam sync work independently.

---

## 🏃 Getting Started

### Prerequisites

- **Node.js 20+**
- **npm**

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Starts the full-stack server with Vite middleware (hot module reload). Open **http://localhost:3001**.

### Production build

```bash
npm run build
```

Bundles the frontend with Vite and the backend with esbuild into `dist-server/server.cjs`.

### Start production server

```bash
npm run start
```

Compiles first if needed (stale or missing bundles are rebuilt automatically), then serves the static build + API on `http://localhost:3001`. The script forces `NODE_ENV=production`, enabling the strict CSP.

### Other commands

```bash
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run typecheck  # same as lint
npm test           # run the vitest suite
npm run clean      # remove build artifacts
```

### Docker

A `Dockerfile` is included for containerized deployments. Mount a volume at the data directory (default `./data`, or whatever `GAMETRACK_DATA_DIR` points to) so your registry persists.

---

## 🧪 Testing

```bash
npm test
```

The suite covers:

- **API smoke tests** (`tests/api.test.ts`) — health, CSRF rejection, invalid JSON handling, input validation, duplicate detection, partial-update semantics (zod defaults must not clobber omitted fields), status transition date stamping, custom order persistence, corrupted JSON column tolerance, export round-trips, poster upload spoofing, Steam settings key privacy, cache headers, and SPA fallback behavior. Tests run against a throwaway temp database.
- **Analytics render test** (`tests/analytics-render.test.tsx`) — proves the Analytics viewport renders without crashing on real-shaped data.

---

## 📁 Project Structure

```
gametrack/
├── server.ts                 # Express app factory + entry point
├── server/
│   ├── db.ts                 # SQLite connection & schema init
│   ├── routes.ts             # All API routes, zod schemas, parsing
│   ├── igdb.ts               # IGDB token + query proxy
│   ├── steam.ts              # Steam Web API client
│   └── paths.ts              # Data/poster/dist directory resolution
├── src/
│   ├── App.tsx               # Shell: sidebar, tab routing, overlays
│   ├── store.ts              # Zustand store (games, filters, settings, actions)
│   ├── types.ts              # Shared TypeScript types
│   ├── constants.ts          # Statuses, platforms
│   ├── index.css             # Tailwind theme tokens (--brand-*)
│   └── components/           # One file per view + modals
│       ├── LandingView.tsx       # Entry gate
│       ├── DashboardView.tsx     # 00 CENTRAL
│       ├── LibraryView.tsx       # 01 LIBRARY (grid, filters, drag-order)
│       ├── DiscoverView.tsx      # 02 DISCOVER (search + curated rails)
│       ├── AnalyticsView.tsx     # 03 ANALYTICS (lazy-loaded)
│       ├── AddGameModal.tsx      # Manual add
│       ├── GameDetailsModal.tsx  # Detail/quick-log
│       ├── SettingsModal.tsx     # Steam, backup, wipe
│       ├── AuthModal.tsx         # Steam linking
│       ├── Toast.tsx             # Notifications
│       └── PosterImage.tsx       # Poster with graceful fallback
├── tests/                   # vitest suites
├── data/                    # SQLite DB + uploaded posters (gitignored)
├── dist/                    # Built frontend
├── dist-server/             # Built backend
└── screenshots/             # (optional) README captures
```

---

## 🔒 Security Notes

- **CSRF / origin pinning** — every state-changing request must carry an allowed `Origin`; missing or foreign origins get a clean 403 (also defeats DNS rebinding).
- **CSP** — production serves a strict Content-Security-Policy: `script-src 'self'` with sha256 hashes allowing the two inline bootstrap scripts (theme pre-paint + boot watchdog), and image hosts allow-listed for IGDB/Steam assets.
- **Rate limiting** — API (200/min), discovery (20/min), uploads (10/min), and Steam sync (2/min).
- **No secrets to the client** — IGDB client secret stays server-side; the Steam key is stored but never returned by any API.
- **Poster upload validation** — uploaded files are checked against real image magic bytes, so spoofed "image/png" payloads are rejected.
- **Optional bearer token** — set `API_TOKEN` to require `Authorization: Bearer <token>` on every API call for multi-user/remote setups.
- **Cache discipline** — all API responses carry `no-store` headers; hashed assets get long immutable caches.

---

## 🎨 Visual System

- **Cosmic slate palette** — near-black charcoal backgrounds (`#0a0a0a` family), zinc borders, and a signature yellow accent (`--brand-accent`) used sparingly for focus, active states, and completion markers.
- **Typographic contrast** — heavy, tight-tracked display sans (Inter) for headings at up to 110px, paired with JetBrains Mono for all metadata, labels, and data.
- **Architectural honesty** — sharp corners everywhere, exposed borders as structure, `border-l-8` session panels, and status colors that carry meaning (backlog = zinc, playing = emerald, completed = yellow, endless = fuchsia).
- **Micro-motion discipline** — short, fast transitions (120–250ms): viewport fades, height-collapsing filter panel, poster hover zoom, card opacity during drag — nothing floats or lingers.

---

**GAMETRACK_ — your registry, your data, on your machine.**

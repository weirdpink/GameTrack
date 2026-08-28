import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { normalizePlatformIds } from "../src/constants";
import { DATA_DIR, ensureDataDir } from "./paths";

// Database lives inside the data directory for full portability.
const DB_PATH = path.join(DATA_DIR, "gametrack.db");

// Ensure the data directory exists with restricted permissions.
ensureDataDir();

const db = new Database(DB_PATH);
// Restrict database file permissions
fs.chmodSync(DB_PATH, 0o600);

// ── Performance tuning ────────────────────────────────────────────
// WAL mode allows concurrent reads while writing and is significantly
// faster than the default journal mode for this workload.
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("cache_size = -64000");

// ── Schema ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    year INTEGER,
    igdb_id INTEGER,
    genres TEXT DEFAULT '[]',
    synopsis TEXT DEFAULT '',
    poster_url TEXT DEFAULT '',
    critic_score INTEGER CHECK (critic_score IS NULL OR (critic_score >= 0 AND critic_score <= 100)),
    owned_platforms TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'backlog'
      CHECK (status IN ('backlog', 'playing', 'completed', 'endless')),
    playtime REAL DEFAULT 0,
    personal_rating INTEGER CHECK (personal_rating IS NULL OR (personal_rating >= 0 AND personal_rating <= 10)),
    date_added INTEGER NOT NULL,
    date_completed INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    hide_playtime INTEGER DEFAULT 0 CHECK (hide_playtime IN (0, 1)),
    steam_appid INTEGER,
    custom_order INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Indexes for common query patterns
  CREATE INDEX IF NOT EXISTS idx_games_date ON games(date_added DESC);
  CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
`);

// ── Migrations (versioned via PRAGMA user_version) ──────────────────
//
// Each migration block runs exactly once, in order. user_version is bumped
// only after a block completes successfully; a failed migration fails loudly
// at startup instead of being silently re-run every boot.

const SCHEMA_VERSION = 6;

function migrateTo(target: number) {
  const current = Number(db.pragma("user_version", { simple: true })) || 0;
  if (current >= target) return;
  for (let v = current + 1; v <= target; v++) {
    // Each version runs atomically — a failure mid-migration rolls the whole
    // version back instead of leaving partial DDL behind with a stale
    // user_version.
    const migrate = db.transaction(() => {
      runMigration(v);
      db.pragma(`user_version = ${v}`);
    });
    migrate();
  }
}

function runMigration(version: number) {
  const gameColumns = db.prepare("PRAGMA table_info(games)").all() as any[];

  if (version === 1) {
    if (!gameColumns.some((col) => col.name === "steam_appid")) {
      db.exec("ALTER TABLE games ADD COLUMN steam_appid INTEGER");
      db.exec("CREATE INDEX IF NOT EXISTS idx_games_steam ON games(steam_appid)");
    }

    // RAWG was removed — the external game id column was renamed to igdb_id.
    if (gameColumns.some((col) => col.name === "rawg_id") && !gameColumns.some((col) => col.name === "igdb_id")) {
      db.exec("ALTER TABLE games RENAME COLUMN rawg_id TO igdb_id");
      db.exec("DROP INDEX IF EXISTS idx_games_rawg");
      db.exec("CREATE INDEX IF NOT EXISTS idx_games_igdb ON games(igdb_id)");
    } else {
      db.exec("CREATE INDEX IF NOT EXISTS idx_games_igdb ON games(igdb_id)");
    }

    // "Main Story Done, Playing" was removed — convert existing entries to Completed.
    db.exec("UPDATE games SET status = 'completed' WHERE status = 'main_complete'");

    // "Multiplayer" status was removed — convert existing entries to Backlog.
    db.exec("UPDATE games SET status = 'backlog' WHERE status = 'multiplayer'");

    // Wishlist was removed from GameTrack — turn former wishlist entries into
    // plain backlog entries and drop the column (SQLite 3.35+).
    if (gameColumns.some((col) => col.name === "is_wishlist")) {
      db.exec("DROP INDEX IF EXISTS idx_games_wishlist");
      db.exec("UPDATE games SET is_wishlist = 0 WHERE status NOT IN ('backlog', 'playing', 'completed', 'endless')");
      db.exec("UPDATE games SET status = 'backlog', is_wishlist = 0 WHERE is_wishlist = 1");
      try {
        db.exec("ALTER TABLE games DROP COLUMN is_wishlist");
      } catch (err) {
        console.warn("Could not drop is_wishlist column (SQLite < 3.35 or referenced):", err);
      }
    }

    // Notes feature was removed from GameTrack — drop the column (SQLite 3.35+).
    if (gameColumns.some((col) => col.name === "notes")) {
      try {
        db.exec("ALTER TABLE games DROP COLUMN notes");
      } catch (err) {
        console.warn("Could not drop notes column (SQLite < 3.35 or referenced):", err);
      }
    }

    // Play sessions were removed from GameTrack — drop the table entirely.
    db.exec("DROP TABLE IF EXISTS play_sessions");

    // Normalize legacy platform slugs (IGDB forms like "pc", "playstation5",
    // "xbox-one") into canonical app platform ids stored on existing games.
    const platformRows = db.prepare("SELECT id, owned_platforms FROM games WHERE owned_platforms IS NOT NULL AND owned_platforms != '[]'").all() as any[];
    if (platformRows.length) {
      const updatePlatforms = db.prepare("UPDATE games SET owned_platforms = ? WHERE id = ?");
      const migratePlatforms = db.transaction((rows: any[]) => {
        for (const row of rows) {
          let list: string[] = [];
          try {
            list = JSON.parse(row.owned_platforms);
          } catch {
            continue;
          }
          if (!Array.isArray(list)) continue;
          const normalized = normalizePlatformIds(list);
          if (JSON.stringify(normalized) !== JSON.stringify(list)) {
            updatePlatforms.run(JSON.stringify(normalized), row.id);
          }
        }
      });
      migratePlatforms(platformRows);
    }
  }

  if (version === 2) {
    // De-duplicate rows sharing an igdb_id / steam_appid (keep the oldest),
    // then enforce uniqueness so double-submits can never create duplicates.
    db.exec(`
      DELETE FROM games
      WHERE igdb_id IS NOT NULL
        AND id NOT IN (SELECT MIN(id) FROM games WHERE igdb_id IS NOT NULL GROUP BY igdb_id)
    `);
    db.exec(`
      DELETE FROM games
      WHERE steam_appid IS NOT NULL
        AND id NOT IN (SELECT MIN(id) FROM games WHERE steam_appid IS NOT NULL GROUP BY steam_appid)
    `);
    db.exec("DROP INDEX IF EXISTS idx_games_igdb");
    db.exec("CREATE UNIQUE INDEX idx_games_igdb ON games(igdb_id) WHERE igdb_id IS NOT NULL");
    db.exec("DROP INDEX IF EXISTS idx_games_steam");
    db.exec("CREATE UNIQUE INDEX idx_games_steam ON games(steam_appid) WHERE steam_appid IS NOT NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_games_title_lower ON games(lower(title))");
    db.exec("CREATE INDEX IF NOT EXISTS idx_games_updated ON games(updated_at)");
  }

  if (version === 3) {
    // Hand-arranged library order. NULL means "not placed" (sorts last).
    if (!gameColumns.some((col) => col.name === "custom_order")) {
      db.exec("ALTER TABLE games ADD COLUMN custom_order INTEGER");
      db.exec("CREATE INDEX IF NOT EXISTS idx_games_custom_order ON games(custom_order)");
    }
  }

  if (version === 4 || version === 5 || version === 6) {
    // Wishlist — games you want, tracked separately from the library.
    db.exec(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        igdb_id INTEGER UNIQUE,
        title TEXT NOT NULL,
        year INTEGER,
        poster_url TEXT DEFAULT '',
        genres TEXT DEFAULT '[]',
        owned_platforms TEXT DEFAULT '[]',
        critic_score INTEGER CHECK (critic_score IS NULL OR (critic_score >= 0 AND critic_score <= 100)),
        synopsis TEXT DEFAULT '',
        date_added INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wishlist_date ON wishlist(date_added DESC);
    `);

    // Ensure igdb_id column exists on games table
    const currentGamesCols = db.prepare("PRAGMA table_info(games)").all() as any[];
    if (currentGamesCols.some((col) => col.name === "rawg_id") && !currentGamesCols.some((col) => col.name === "igdb_id")) {
      db.exec("ALTER TABLE games RENAME COLUMN rawg_id TO igdb_id");
      db.exec("DROP INDEX IF EXISTS idx_games_rawg");
    } else if (!currentGamesCols.some((col) => col.name === "igdb_id")) {
      db.exec("ALTER TABLE games ADD COLUMN igdb_id INTEGER");
    }
    db.exec("DROP INDEX IF EXISTS idx_games_igdb");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_games_igdb ON games(igdb_id) WHERE igdb_id IS NOT NULL");

    // Ensure igdb_id column exists on wishlist table
    const currentWishlistCols = db.prepare("PRAGMA table_info(wishlist)").all() as any[];
    if (currentWishlistCols.some((col) => col.name === "rawg_id") && !currentWishlistCols.some((col) => col.name === "igdb_id")) {
      db.exec("ALTER TABLE wishlist RENAME COLUMN rawg_id TO igdb_id");
      db.exec("DROP INDEX IF EXISTS idx_wishlist_rawg");
    } else if (!currentWishlistCols.some((col) => col.name === "igdb_id")) {
      db.exec("ALTER TABLE wishlist ADD COLUMN igdb_id INTEGER");
    }
    db.exec("DROP INDEX IF EXISTS idx_wishlist_igdb");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_igdb ON wishlist(igdb_id) WHERE igdb_id IS NOT NULL");
  }
}

migrateTo(SCHEMA_VERSION);

// Defensive integrity check on startup
function ensureSchemaIntegrity() {
  const gamesCols = db.prepare("PRAGMA table_info(games)").all() as any[];
  if (gamesCols.some((col) => col.name === "rawg_id") && !gamesCols.some((col) => col.name === "igdb_id")) {
    db.exec("ALTER TABLE games RENAME COLUMN rawg_id TO igdb_id");
    db.exec("DROP INDEX IF EXISTS idx_games_rawg");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_games_igdb ON games(igdb_id) WHERE igdb_id IS NOT NULL");
  }

  const wishlistCols = db.prepare("PRAGMA table_info(wishlist)").all() as any[];
  if (wishlistCols.some((col) => col.name === "rawg_id") && !wishlistCols.some((col) => col.name === "igdb_id")) {
    db.exec("ALTER TABLE wishlist RENAME COLUMN rawg_id TO igdb_id");
    db.exec("DROP INDEX IF EXISTS idx_wishlist_rawg");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_igdb ON wishlist(igdb_id) WHERE igdb_id IS NOT NULL");
  }
}

ensureSchemaIntegrity();

export default db;

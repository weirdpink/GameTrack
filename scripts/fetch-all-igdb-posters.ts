/**
 * Poster-only refresh — re-point every row at an IGDB (or Steam) cover without
 * touching any other metadata. Useful when only artwork is stale:
 *
 *   npm run fetch-igdb-posters
 *
 * Rows with a stored IGDB id are queried directly (exact, cheapest); rows
 * without one fall back to the conservative title matcher. Steam-owned rows
 * always get the portrait Steam CDN cover, and locally uploaded posters are
 * left alone. Stale RAWG CDN links are purged.
 */
import "dotenv/config";
import db from "../server/db";
import { fetchFromIgdb, getIgdbImageUrl, type IgdbRawGame } from "../server/igdb";
import { getSteamPosterImage } from "../server/steam";
import { assertIgdbReachable, findIgdbMatch, sleep } from "./lib/igdb-match";

const REQUEST_DELAY_MS = 260;

interface Row {
  id: number;
  title: string;
  year: number | null;
  igdb_id: number | null;
  poster_url: string;
  steam_appid?: number | null;
}

function isLocalUpload(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith("/posters/"));
}

function isRawgUrl(url: string | null | undefined): boolean {
  return Boolean(url && /rawg\.io/i.test(url));
}

/** IGDB cover for a known id, or null when the game has no artwork. */
async function coverForId(igdbId: number): Promise<string | null> {
  const rows = await fetchFromIgdb("games", `fields cover.image_id; where id = ${igdbId};`);
  const game = (Array.isArray(rows) ? rows[0] : undefined) as IgdbRawGame | undefined;
  return getIgdbImageUrl(game?.cover?.image_id);
}

async function run(): Promise<void> {
  console.log("Refreshing posters (Steam covers for Steam rows, IGDB covers for the rest)...\n");

  const games = db.prepare(
    "SELECT id, title, year, igdb_id, poster_url, steam_appid FROM games ORDER BY id"
  ).all() as Row[];
  const wishlist = db.prepare(
    "SELECT id, title, year, igdb_id, poster_url FROM wishlist ORDER BY id"
  ).all() as Row[];

  const updateGame = db.prepare("UPDATE games SET poster_url = ?, updated_at = ? WHERE id = ?");
  const updateWishlist = db.prepare("UPDATE wishlist SET poster_url = ? WHERE id = ?");

  let steamCount = 0;
  let igdbCount = 0;
  let keptCount = 0;
  let clearedCount = 0;

  const processRows = async (label: string, rows: Row[], save: (row: Row, poster: string) => void) => {
    let igdbChecked = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      process.stdout.write(`[${label} ${i + 1}/${rows.length}] ${row.title}\n`);

      if (isLocalUpload(row.poster_url)) {
        keptCount++;
        console.log("   -> custom upload kept");
        continue;
      }

      if (row.steam_appid != null) {
        save(row, getSteamPosterImage(row.steam_appid));
        steamCount++;
        console.log("   -> Steam cover");
        continue;
      }

      try {
        const igdbId = row.igdb_id;
        let cover: string | null = null;

        if (igdbId != null) {
          cover = await coverForId(igdbId);
        } else {
          // Rows without a stored id come from manual entry (or an ambiguous
          // title) — hit IGDB once before doing any title search so a
          // misconfigured environment never silently skips everything.
          if (!igdbChecked) {
            igdbChecked = true;
            await assertIgdbReachable();
          }
          const match = await findIgdbMatch(row.title, row.year);
          cover = getIgdbImageUrl(match?.cover?.image_id);
        }

        if (cover) {
          save(row, cover);
          igdbCount++;
          console.log("   -> IGDB cover");
        } else if (isRawgUrl(row.poster_url)) {
          save(row, "");
          clearedCount++;
          console.log("   -> stale RAWG link removed (no IGDB cover found)");
        } else {
          keptCount++;
          console.log("   -> no new cover found; existing poster kept");
        }
      } catch (err: unknown) {
        console.error(`   -> failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      await sleep(REQUEST_DELAY_MS);
    }
  };

  await processRows("library", games, (row, poster) => {
    updateGame.run(poster, Date.now(), row.id);
  });
  await processRows("wishlist", wishlist, (row, poster) => {
    updateWishlist.run(poster, row.id);
  });

  console.log("\n──────────────────────────────────────────────");
  console.log(`Steam covers  : ${steamCount}`);
  console.log(`IGDB covers   : ${igdbCount}`);
  console.log(`Kept as-is    : ${keptCount}`);
  console.log(`RAWG links cut: ${clearedCount}`);
  console.log("Poster refresh complete.");
}

run().catch((err) => {
  console.error("Poster refresh failed:", err);
  process.exit(1);
});

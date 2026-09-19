import "dotenv/config";
import db from "../server/db";
import { mapIgdbGame } from "../server/igdb";
import { assertIgdbReachable, findIgdbMatch } from "./lib/igdb-match";

/**
 * One-off fixer: re-match a single library row against IGDB.
 * Usage: npx tsx scripts/fix-one.ts <game-row-id>
 */
async function run(): Promise<void> {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id)) throw new Error("Usage: npx tsx scripts/fix-one.ts <game-row-id>");

  const row = db.prepare("SELECT id, title, year, steam_appid FROM games WHERE id = ?").get(id) as
    | { id: number; title: string; year: number | null; steam_appid: number | null }
    | undefined;
  if (!row) throw new Error(`No library row #${id}`);

  await assertIgdbReachable();
  const match = await findIgdbMatch(row.title, row.year);
  if (!match) {
    console.log(`No confident IGDB match for "${row.title}"`);
    return;
  }
  const mapped = mapIgdbGame(match);
  console.log(`Matched "${row.title}" -> IGDB #${mapped.igdb_id} "${mapped.title}" (${mapped.year})`);
  try {
    db.prepare(
      `UPDATE games
       SET igdb_id = @igdb_id,
           year = COALESCE(@year, year),
           genres = @genres,
           synopsis = @synopsis,
           critic_score = COALESCE(@critic_score, critic_score),
           updated_at = @updated_at
       WHERE id = @id`
    ).run({
      id: row.id,
      igdb_id: mapped.igdb_id,
      year: mapped.year,
      genres: JSON.stringify(mapped.genres.length ? mapped.genres : []),
      synopsis: mapped.synopsis,
      critic_score: mapped.critic_score,
      updated_at: Date.now(),
    });
  } catch (err: unknown) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      console.error(
        `IGDB #${mapped.igdb_id} is already claimed by another library row — id left empty. ` +
          `Remove the duplicate row first, then re-run.`
      );
      process.exit(1);
    }
    throw err;
  }
  console.log("Row updated (poster untouched).");
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

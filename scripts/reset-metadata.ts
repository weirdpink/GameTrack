import db from "../server/db";
import { fetchFromRawg, mapRawgGame } from "../server/rawg";

async function run() {
  console.log("Starting RAWG metadata reset...");

  const games = db.prepare("SELECT * FROM games").all() as any[];
  const wishlist = db.prepare("SELECT * FROM wishlist").all() as any[];

  console.log(`Found ${games.length} games and ${wishlist.length} wishlist items to reset.`);

  const updateGame = db.prepare(`
    UPDATE games 
    SET rawg_id = @rawg_id, 
        poster_url = @poster_url, 
        synopsis = @synopsis, 
        critic_score = @critic_score,
        genres = @genres
    WHERE id = @id
  `);

  const updateWishlist = db.prepare(`
    UPDATE wishlist 
    SET rawg_id = @rawg_id, 
        poster_url = @poster_url, 
        synopsis = @synopsis, 
        critic_score = @critic_score,
        genres = @genres
    WHERE id = @id
  `);

  async function processItems(items: any[], updateStmt: any, type: string) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`[${type} ${i+1}/${items.length}] Resetting metadata for "${item.title}"...`);
      
      try {
        const data = await fetchFromRawg("games", { search: item.title, search_precise: "true", page_size: "5" });
        const list = Array.isArray(data?.results) ? data.results : [];
        
        let best: any | undefined = list[0]; // Just take the best hit from RAWG
        
        if (best) {
          const mapped = mapRawgGame(best);
          updateStmt.run({
            id: item.id,
            rawg_id: mapped.rawg_id,
            poster_url: mapped.poster_url || item.poster_url,
            synopsis: mapped.synopsis,
            critic_score: mapped.critic_score,
            genres: JSON.stringify(mapped.genres)
          });
          console.log(`  -> Matched with RAWG ID ${mapped.rawg_id}`);
        } else {
          console.log(`  -> No match found in RAWG.`);
        }
      } catch (err: any) {
        console.error(`  -> Failed: ${err.message}`);
      }
      
      // Delay to respect RAWG rate limits
      await new Promise(r => setTimeout(r, 200)); 
    }
  }

  await processItems(games, updateGame, "Library");
  await processItems(wishlist, updateWishlist, "Wishlist");

  console.log("Reset complete!");
}

run().catch(console.error);

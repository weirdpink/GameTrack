import db from "../server/db";
import { fetchIgdbPostersBatch } from "../server/igdb-posters";

async function run() {
  console.log("Starting IGDB poster fetch for all games...");

  const games = db.prepare("SELECT * FROM games").all() as any[];
  const wishlist = db.prepare("SELECT * FROM wishlist").all() as any[];

  console.log(`Found ${games.length} games and ${wishlist.length} wishlist items.`);

  const allTitles = [...new Set([...games.map(g => g.title), ...wishlist.map(w => w.title)])];
  console.log(`Fetching IGDB posters for ${allTitles.length} unique titles...`);
  
  // Batch them
  let allPosters: Record<string, string> = {};
  for (let i = 0; i < allTitles.length; i += 40) {
    const batch = allTitles.slice(i, i + 40);
    const results = await fetchIgdbPostersBatch(batch);
    allPosters = { ...allPosters, ...results };
    await new Promise(r => setTimeout(r, 1000)); // Respect IGDB limits
  }

  const updateGame = db.prepare(`UPDATE games SET poster_url = ? WHERE id = ?`);
  const updateWishlist = db.prepare(`UPDATE wishlist SET poster_url = ? WHERE id = ?`);

  let gUpdated = 0;
  for (const game of games) {
    if (allPosters[game.title]) {
      updateGame.run(allPosters[game.title], game.id);
      gUpdated++;
    }
  }

  let wUpdated = 0;
  for (const item of wishlist) {
    if (allPosters[item.title]) {
      updateWishlist.run(allPosters[item.title], item.id);
      wUpdated++;
    }
  }

  console.log(`Updated ${gUpdated} library games and ${wUpdated} wishlist items with IGDB posters.`);
}

run().catch(console.error);



let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getIgdbToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET is missing. Cannot fetch IGDB posters.");
  }

  const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch IGDB token: ${res.status}`);
  }
  
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

export async function fetchIgdbPoster(title: string): Promise<string | null> {
  if (!title) return null;
  try {
    const token = await getIgdbToken();
    const clientId = process.env.IGDB_CLIENT_ID!;
    
    // Clean title for apicalypse query
    const cleanTitle = title.replace(/[\\"\r\n;]/g, "");
    const query = `search "${cleanTitle}"; fields cover.image_id; limit 1;`;
    
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "text/plain"
      },
      body: query
    });
    
    if (!res.ok) return null;
    const data = await res.json() as any[];
    
    if (data && data.length > 0 && data[0].cover?.image_id) {
      return `https://images.igdb.com/igdb/image/upload/t_cover_big/${data[0].cover.image_id}.jpg`;
    }
    return null;
  } catch (err) {
    console.error(`[IGDB Poster Error] Failed to fetch poster for "${title}":`, err);
    return null;
  }
}

/**
 * Fetch multiple posters efficiently. IGDB allows up to 10 queries per multiquery request.
 */
export async function fetchIgdbPostersBatch(titles: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const uniqueTitles = [...new Set(titles.filter(Boolean))];
  if (uniqueTitles.length === 0) return result;

  try {
    const token = await getIgdbToken();
    const clientId = process.env.IGDB_CLIENT_ID!;
    
    // Chunk into batches of 10
    const chunks = [];
    for (let i = 0; i < uniqueTitles.length; i += 10) {
      chunks.push(uniqueTitles.slice(i, i + 10));
    }
    
    for (const chunk of chunks) {
      const queries = chunk.map((title, i) => {
        const cleanTitle = title.replace(/[\\"\r\n;]/g, "");
        return `query games "game_${i}" { search "${cleanTitle}"; fields cover.image_id; limit 1; };`;
      }).join("\n");
      
      const res = await fetch("https://api.igdb.com/v4/multiquery", {
        method: "POST",
        headers: {
          "Client-ID": clientId,
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
          "Content-Type": "text/plain"
        },
        body: queries
      });
      
      if (!res.ok) continue;
      const data = await res.json() as any[];
      
      if (Array.isArray(data)) {
        for (let i = 0; i < chunk.length; i++) {
          const mqResult = data.find(d => d.name === `game_${i}`);
          if (mqResult && Array.isArray(mqResult.result) && mqResult.result.length > 0) {
            const cover = mqResult.result[0].cover;
            if (cover && cover.image_id) {
              result[chunk[i]] = `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.image_id}.jpg`;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[IGDB Poster Batch Error]:", err);
  }
  
  return result;
}

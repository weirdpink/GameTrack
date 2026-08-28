const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_BASE_URL = "https://api.igdb.com/v4";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

/** Shape of a raw game object returned by the IGDB API. */
export interface IgdbRawGame {
  id: number;
  name?: string;
  first_release_date?: number;
  genres?: { name: string }[];
  summary?: string;
  storyline?: string;
  cover?: { image_id?: string };
  rating?: number;
  aggregated_rating?: number;
  platforms?: { name?: string; slug?: string }[];
  hypes?: number;
}

/** Normalized game shape returned by mapIgdbGame. */
export interface IgdbMappedGame {
  igdb_id: number;
  title: string;
  year: number | null;
  genres: string[];
  synopsis: string;
  poster_url: string | null;
  critic_score: number | null;
  owned_platforms: string[];
}

let cachedToken: CachedToken | null = null;
let tokenPromise: Promise<string> | null = null;

/** PC-store platform ids that are kept as ownership tags from IGDB data. */
const PC_STORE_PLATFORMS = new Set([
  "steam",
  "epic-games",
  "gog",
  "ea-play",
  "rockstar",
]);

/** IGDB store slugs/names → the app's platform tag ids (explicit store matches only). */
const STORE_SLUG_ALIASES: Record<string, string> = {
  steam: "steam",
  "epic-games": "epic-games",
  "epic games": "epic-games",
  gog: "gog",
  "gog.com": "gog",
  origin: "ea-play",
  "ea-app": "ea-play",
  "ea-desktop": "ea-play",
  rockstar: "rockstar",
  "rockstar-games-launcher": "rockstar",
};

/**
 * Retrieves a valid Twitch OAuth Access Token (Client Credentials Grant).
 * Caches the token in memory, refreshes before expiration, and coalesces
 * concurrent refreshes into a single in-flight request.
 */
export async function getIgdbAccessToken(): Promise<string> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET environment variables are missing.");
  }

  // Return cached token if valid (with 60-second buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(TWITCH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to obtain Twitch OAuth token (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };

      cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      return cachedToken.accessToken;
    } finally {
      clearTimeout(timeoutId);
    }
  })().finally(() => {
    tokenPromise = null;
  });

  return tokenPromise;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;

function isRetryable(status: number | undefined): boolean {
  if (status === undefined) return true; // network / timeout
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an Apicalypse query against an IGDB endpoint with bounded retry
 * (exponential backoff on 429/5xx/network errors) and automatic re-auth on 401.
 */
export async function fetchFromIgdb(endpoint: string, query: string): Promise<unknown> {
  const clientId = process.env.IGDB_CLIENT_ID;
  if (!clientId) {
    throw new Error("IGDB_CLIENT_ID environment variable is missing.");
  }

  let token = await getIgdbAccessToken();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: {
          "Client-ID": clientId,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: query,
        signal: controller.signal,
      });

      if (response.status === 401) {
        // Token revoked/expired early — force a fresh one and retry once.
        cachedToken = null;
        token = await getIgdbAccessToken();
        continue;
      }

      if (!response.ok) {
        if (isRetryable(response.status) && attempt < MAX_RETRIES - 1) {
          lastError = new Error(`IGDB API error on /${endpoint} (${response.status})`);
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        const errText = await response.text();
        throw new Error(`IGDB API error on /${endpoint} (${response.status}): ${errText}`);
      }

      // IGDB occasionally returns 200 with an empty body — read as text and
      // retry instead of letting response.json() throw and skip the retry loop.
      const bodyText = await response.text();
      if (!bodyText.trim()) {
        if (attempt < MAX_RETRIES - 1) {
          lastError = new Error(`IGDB returned an empty body on /${endpoint}`);
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new Error(`IGDB returned an empty body on /${endpoint}`);
      }
      return JSON.parse(bodyText);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError" && attempt < MAX_RETRIES - 1) {
        lastError = new Error(`IGDB request timed out on /${endpoint}`);
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error(`IGDB request failed on /${endpoint}`);
}

// ── Server-side TTL cache ────────────────────────────────────────
// Discover queries are expensive (each /lists hit fires 4 IGDB calls) and
// the same data is viewed repeatedly — hold stable results in memory so
// browser refreshes / tab switches don't multiply upstream cost.
const discoveryCache = new Map<string, { at: number; data: unknown }>();
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
let curatedListsCache: { at: number; data: { topThisMonth: IgdbMappedGame[]; bestAllTime: IgdbMappedGame[]; newReleases: IgdbMappedGame[]; mostHyped: IgdbMappedGame[] } } | null = null;

/**
 * fetchFromIgdb with a short TTL, keyed on endpoint + query. Callers keep
 * using fetchFromIgdb directly for user-specific or one-shot queries.
 */
export async function cachedFetchFromIgdb(endpoint: string, query: string, ttlMs: number = DISCOVERY_CACHE_TTL_MS): Promise<unknown> {
  const cacheKey = `${endpoint}\u0000${query}`;
  const hit = discoveryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.data;
  }
  if (hit) discoveryCache.delete(cacheKey); // expired — free the entry, don't accumulate
  const data = await fetchFromIgdb(endpoint, query);
  discoveryCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

/**
 * Helper to build high-quality IGDB cover image URLs.
 */
export function getIgdbImageUrl(imageId: string | undefined | null, size: string = "t_cover_big"): string | null {
  if (!imageId) return null;
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

/**
 * Maps an IGDB raw game object to our application's normalized format.
 */
export function mapIgdbGame(item: IgdbRawGame): IgdbMappedGame {
  const year = item.first_release_date
    ? new Date(item.first_release_date * 1000).getFullYear()
    : null;

  const genres = Array.isArray(item.genres)
    ? item.genres.map((g) => g.name).filter(Boolean)
    : [];

  // IGDB platforms = every platform a game was *released* on (all consoles).
  // The app's platform tags mean *what the user owns*, so only keep stores
  // IGDB explicitly lists — never blanket-map "PC" to Steam. The user picks
  // their actual ownership tags when adding.
  const owned_platforms = Array.isArray(item.platforms)
    ? [...new Set(
        item.platforms
          .map((p) => (typeof p?.slug === "string" ? p.slug : p?.name || ""))
          .map((slug: string) => STORE_SLUG_ALIASES[slug.trim().toLowerCase()])
          .filter((pid: string | undefined): pid is string => Boolean(pid && PC_STORE_PLATFORMS.has(pid)))
      )]
    : [];

  const poster_url = item.cover?.image_id
    ? getIgdbImageUrl(item.cover.image_id, "t_cover_big")
    : null;

  const critic_score = typeof item.aggregated_rating === "number" 
    ? Math.round(item.aggregated_rating) 
    : (typeof item.rating === "number" ? Math.round(item.rating) : null);

  let synopsis = "No synopsis available.";
  if (item.summary && item.storyline && !item.summary.includes(item.storyline)) {
    synopsis = `${item.summary}\n\n${item.storyline}`;
  } else if (item.summary) {
    synopsis = item.summary;
  } else if (item.storyline) {
    synopsis = item.storyline;
  }

  return {
    igdb_id: item.id,
    title: item.name || "Untitled Game",
    year,
    genres,
    synopsis,
    poster_url,
    critic_score,
    owned_platforms,
  };
}

const GAME_FIELDS = "fields name, first_release_date, genres.name, summary, storyline, cover.image_id, rating, aggregated_rating, platforms.name, platforms.slug;";

/**
 * Curated editorial lists for the Discover page — four parallel IGDB
 * queries resolved in a single round trip.
 */
export async function fetchCuratedLists(): Promise<{
  topThisMonth: IgdbMappedGame[];
  bestAllTime: IgdbMappedGame[];
  newReleases: IgdbMappedGame[];
  mostHyped: IgdbMappedGame[];
}> {
  const cached = curatedListsCache;
  if (cached && Date.now() - cached.at < DISCOVERY_CACHE_TTL_MS) {
    return cached.data;
  }

  const now = Math.floor(Date.now() / 1000);
  // Rolling 90-day window — "this month" alone is too sparse for rated games.
  const since90d = now - 90 * 86400;

  const [topThisMonth, bestAllTime, newReleases, mostHyped] = await Promise.all([
    // Recent releases, ranked by community rating.
    fetchFromIgdb(
      "games",
      `${GAME_FIELDS} where first_release_date >= ${since90d} & first_release_date <= ${now} & rating_count >= 10; sort rating desc; limit 15;`
    ),
    // Highest aggregate critical score of all time.
    fetchFromIgdb(
      "games",
      `${GAME_FIELDS} where aggregated_rating_count >= 10; sort aggregated_rating desc; limit 15;`
    ),
    // The freshest additions to the catalog.
    fetchFromIgdb(
      "games",
      `${GAME_FIELDS} where first_release_date <= ${now} & cover != null; sort first_release_date desc; limit 15;`
    ),
    // The most hyped upcoming titles.
    fetchFromIgdb(
      "games",
      `${GAME_FIELDS} where hypes > 300 & cover != null; sort hypes desc; limit 15;`
    ),
  ]);

  const lists = {
    topThisMonth: (Array.isArray(topThisMonth) ? (topThisMonth as IgdbRawGame[]) : []).map(mapIgdbGame),
    bestAllTime: (Array.isArray(bestAllTime) ? (bestAllTime as IgdbRawGame[]) : []).map(mapIgdbGame),
    newReleases: (Array.isArray(newReleases) ? (newReleases as IgdbRawGame[]) : []).map(mapIgdbGame),
    mostHyped: (Array.isArray(mostHyped) ? (mostHyped as IgdbRawGame[]) : []).map(mapIgdbGame),
  };
  curatedListsCache = { at: Date.now(), data: lists };
  return lists;
}

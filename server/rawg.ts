const RAWG_BASE_URL = "https://api.rawg.io/api";

export interface RawgGame {
  id: number;
  name?: string;
  released?: string;
  background_image?: string;
  metacritic?: number;
  genres?: { name: string }[];
  platforms?: { platform: { name: string; slug: string } }[];
  description_raw?: string;
}

export interface RawgMappedGame {
  rawg_id: number;
  title: string;
  year: number | null;
  genres: string[];
  synopsis: string;
  poster_url: string | null;
  critic_score: number | null;
  owned_platforms: string[];
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

export async function fetchFromRawg(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    throw new Error("RAWG_API_KEY environment variable is missing.");
  }

  const url = new URL(`${RAWG_BASE_URL}/${endpoint}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal as any,
      });

      if (!response.ok) {
        if (isRetryable(response.status) && attempt < MAX_RETRIES - 1) {
          lastError = new Error(`RAWG API error on /${endpoint} (${response.status})`);
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        const errText = await response.text();
        throw new Error(`RAWG API error on /${endpoint} (${response.status}): ${errText}`);
      }

      const bodyText = await response.text();
      if (!bodyText.trim()) {
        if (attempt < MAX_RETRIES - 1) {
          lastError = new Error(`RAWG returned an empty body on /${endpoint}`);
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new Error(`RAWG returned an empty body on /${endpoint}`);
      }
      return JSON.parse(bodyText);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError" && attempt < MAX_RETRIES - 1) {
        lastError = new Error(`RAWG request timed out on /${endpoint}`);
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error(`RAWG request failed on /${endpoint}`);
}

const discoveryCache = new Map<string, { at: number; data: unknown }>();
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
let curatedListsCache: { at: number; data: { topThisMonth: RawgMappedGame[]; bestAllTime: RawgMappedGame[]; newReleases: RawgMappedGame[]; mostHyped: RawgMappedGame[] } } | null = null;

export async function cachedFetchFromRawg(endpoint: string, params: Record<string, string> = {}, ttlMs: number = DISCOVERY_CACHE_TTL_MS): Promise<any> {
  const cacheKey = `${endpoint}\u0000${JSON.stringify(params)}`;
  const hit = discoveryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.data;
  }
  if (hit) discoveryCache.delete(cacheKey);
  const data = await fetchFromRawg(endpoint, params);
  discoveryCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function mapRawgGame(item: RawgGame): RawgMappedGame {
  let year: number | null = null;
  if (item.released) {
    const d = new Date(item.released);
    if (!isNaN(d.getTime())) year = d.getFullYear();
  }

  const genres = Array.isArray(item.genres)
    ? item.genres.map((g) => g.name).filter(Boolean)
    : [];

  const owned_platforms = Array.isArray(item.platforms)
    ? [...new Set(
        item.platforms
          .map((p) => p.platform?.slug)
          .filter((slug: string | undefined): slug is string => Boolean(slug))
      )]
    : [];

  const poster_url = item.background_image || null;
  const critic_score = item.metacritic || null;

  return {
    rawg_id: item.id,
    title: item.name || "Untitled Game",
    year,
    genres,
    synopsis: item.description_raw || "No synopsis available.",
    poster_url,
    critic_score,
    owned_platforms,
  };
}

export async function fetchCuratedLists(): Promise<{
  topThisMonth: RawgMappedGame[];
  bestAllTime: RawgMappedGame[];
  newReleases: RawgMappedGame[];
  mostHyped: RawgMappedGame[];
}> {
  const cached = curatedListsCache;
  if (cached && Date.now() - cached.at < DISCOVERY_CACHE_TTL_MS) {
    return cached.data;
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const last30DaysStr = d30.toISOString().split("T")[0];

  const d180 = new Date();
  d180.setDate(d180.getDate() + 180);
  const next180DaysStr = d180.toISOString().split("T")[0];

  const [topThisMonth, bestAllTime, newReleases, mostHyped] = await Promise.all([
    fetchFromRawg("games", { dates: `${last30DaysStr},${todayStr}`, ordering: "-rating", page_size: "15" }),
    fetchFromRawg("games", { ordering: "-rating", page_size: "15" }),
    fetchFromRawg("games", { dates: `${last30DaysStr},${todayStr}`, ordering: "-released", page_size: "15" }),
    fetchFromRawg("games", { dates: `${todayStr},${next180DaysStr}`, ordering: "-added", page_size: "15" }),
  ]);

  const mapList = (data: any) => (Array.isArray(data?.results) ? data.results.map(mapRawgGame) : []);

  const lists = {
    topThisMonth: mapList(topThisMonth),
    bestAllTime: mapList(bestAllTime),
    newReleases: mapList(newReleases),
    mostHyped: mapList(mostHyped),
  };
  curatedListsCache = { at: Date.now(), data: lists };
  return lists;
}

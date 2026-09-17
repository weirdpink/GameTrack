import { fetchFromRawg, mapRawgGame } from "./rawg";

const STEAM_API_BASE = "https://api.steampowered.com";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Error whose message is safe & useful to show the user (e.g. "profile must
 * be public"). Everything else thrown from the Steam layer is an internal
 * error — its message may contain API internals and must not reach the client.
 */
export class SteamUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteamUserError";
  }
}

/** Error when Steam API cannot be reached due to network/offline status or timeout. */
export class SteamNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteamNetworkError";
  }
}

/**
 * Resolve the Steam Web API key: STEAM_WEB_API_KEY in .env always wins,
 * falling back to the DB-stored key (legacy UI input).
 */
export function effectiveSteamApiKey(dbKey?: string): string {
  return (process.env.STEAM_WEB_API_KEY || "").trim() || (dbKey || "").trim();
}

async function steamFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal as any });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Steam API error (${res.status}): ${text.slice(0, 300)}`);
    }
    return await res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new SteamNetworkError("Steam API request timed out");
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("ENOTFOUND") ||
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("EAI_AGAIN")
    ) {
      throw new SteamNetworkError("Steam API is unreachable (network offline or DNS error)");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Parse a Steam profile URL / vanity name / raw SteamID64 into a SteamID64. */
export async function resolveSteamId(apiKey: string, input: string): Promise<string> {
  const trimmed = input.trim();
  if (/^\d{17}$/.test(trimmed)) return trimmed;

  // Accept the canonical path plus anything after it (query strings like
  // `?tab=...`, trailing slashes, fragments) — all valid profile URLs.
  const urlMatch = trimmed.match(/^https?:\/\/(?:www\.)?steamcommunity\.com\/(id|profiles)\/([A-Za-z0-9_-]{1,64})(?:[/?#]|$)/i);
  if (!urlMatch && !/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
    throw new SteamUserError(
      "Invalid Steam profile. Use a vanity name, a 17-digit SteamID, or a steamcommunity.com profile URL."
    );
  }
  const raw = (urlMatch ? urlMatch[2]! : trimmed).trim();
  if (/^\d{17}$/.test(raw)) return raw;

  const data = await steamFetch(
    `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(raw)}&format=json`
  );
  const steamId = data?.response?.steamid;
  if (!steamId) {
    const msg = data?.response?.message || "Vanity URL not found";
    throw new SteamUserError(`Could not resolve Steam profile "${raw}" (${msg}).`);
  }
  return steamId;
}

export interface SteamOwnedGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  img_icon_url?: string;
}

export interface SteamPlayerSummary {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  profileUrl: string;
}

export async function fetchPlayerSummary(apiKey: string, steamId: string): Promise<SteamPlayerSummary> {
  const data = await steamFetch(
    `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${steamId}&format=json`
  );
  const player = data?.response?.players?.[0];
  if (!player) throw new SteamUserError("Could not fetch Steam profile details.");
  return {
    steamId,
    personaName: player.personaname || "Steam User",
    avatarUrl: player.avatarfull || "",
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
  };
}

export async function fetchOwnedGames(apiKey: string, steamId: string): Promise<SteamOwnedGame[]> {
  const data = await steamFetch(
    `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`
  );
  const games = data?.response?.games;
  if (!Array.isArray(games)) {
    throw new SteamUserError(
      "Steam returned no games. The profile must be public or the API key must belong to this account."
    );
  }
  return games.map((g: any) => ({
    appid: g.appid,
    name: g.name || "Untitled Game",
    playtime_forever: g.playtime_forever || 0,
    img_icon_url: g.img_icon_url || undefined,
  }));
}

/**
 * Steam Store appdetails — used to tell real games apart from apps/software.
 * Throws on network/server failure (callers must treat that as "unknown",
 * never as "not a game"); returns null only for an authoritative not-found.
 */
export interface SteamAppDetails {
  name?: string;
  type?: string;
  short_description?: string;
  genres?: { id: string; description: string }[];
}

const KNOWN_SOFTWARE_APPIDS = new Set<number>([
  431960,  // Wallpaper Engine
  223850,  // 3DMark
  487000,  // VRMark
  524390,  // PCMark 10
  629520,  // Soundpad
  993090,  // Lossless Scaling
  431730,  // Aseprite
  458210,  // VoiceAttack
  400040,  // ShareX
  367670,  // Controller Companion
  365670,  // Blender
  1494420, // OBS Studio
  1664970, // CPU-Z
  1486630, // VRoid Studio
  72850,   // Skyrim Creation Kit
  1118310, // RetroArch
]);

const NON_GAME_GENRES = new Set<string>([
  "utilities",
  "animation & modeling",
  "design & illustration",
  "photo editing",
  "audio production",
  "video production",
  "web publishing",
  "software training",
  "education",
  "game development",
]);

const NON_GAME_TITLE_PATTERNS = [
  /wallpaper\s*engine/i,
  /\b(3dmark|vrmark|pcmark|soundpad|lossless scaling|voiceattack|sharex|blender|obs studio)\b/i,
  /\b(dedicated server|server tool|creation kit|level editor|benchmark|test server|developer tools|mod kit)\b/i,
  /\b(soundtrack|original soundtrack|\bost\b|artbook|art book|season pass)\b/i,
];

/**
 * Determines whether a Steam app is non-game software, a utility, a benchmark,
 * a dedicated server, or a tool, so it never pollutes the game library.
 */
export function isNonGameApp(appid: number, name: string, details?: SteamAppDetails | null): boolean {
  if (KNOWN_SOFTWARE_APPIDS.has(appid)) return true;
  if (NON_GAME_TITLE_PATTERNS.some((pattern) => pattern.test(name))) return true;
  if (details) {
    if (details.type && details.type !== "game" && details.type !== "dlc") return true;
    if (Array.isArray(details.genres)) {
      const hasSoftwareGenre = details.genres.some((g) =>
        NON_GAME_GENRES.has((g.description || "").trim().toLowerCase())
      );
      const hasGameGenre = details.genres.some((g) => {
        const desc = (g.description || "").trim().toLowerCase();
        return !NON_GAME_GENRES.has(desc) && desc !== "casual" && desc !== "indie";
      });
      if (hasSoftwareGenre && !hasGameGenre) return true;
    }
  }
  return false;
}

export async function fetchSteamAppDetails(appid: number): Promise<SteamAppDetails | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`,
      { signal: controller.signal as any }
    );
    if (!res.ok) {
      throw new Error(`Steam Store API error (${res.status}) for app ${appid}`);
    }
    const data = await res.json();
    const entry = data?.[String(appid)];
    if (!entry?.success || !entry.data) return null;
    return entry.data as SteamAppDetails;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Portrait Steam CDN poster for a given appid — exists for virtually all games. */
export function getSteamPosterImage(appid: number): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/gi, "");
}

/** Run async work over items with bounded concurrency (no extra deps). */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      const item = items[idx];
      if (item === undefined) continue;
      results[idx] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Match Steam games to RAWG by searching names directly.
 */
export async function matchSteamToRawg(items: { appid: number; name: string }[]): Promise<Map<number, any>> {
  const matches = new Map<number, any>();
  const uniqueItems = [...new Map(items.map((i) => [i.appid, i])).values()];

  // Search fallback for appids — bounded
  // concurrency so an outage doesn't serialize hundreds of slow calls.
  await mapWithLimit(uniqueItems, 5, async (item) => {
    const target = normalizeName(item.name);
    if (!target) return;
    
    // RAWG has search_precise option which is very helpful for exact matches
    const data = await fetchFromRawg("games", { search: item.name.replace(/[\\"\r\n;]/g, ""), search_precise: "true", page_size: "5" });
    const list = Array.isArray(data?.results) ? data.results : [];
    
    let best: any | undefined;
    for (const row of list) {
      if (normalizeName(row?.name || "") === target) {
        best = row;
        break;
      }
    }
    if (!best && list.length) {
      const first = list[0];
      const firstNorm = normalizeName(first?.name || "");
      if (firstNorm && (firstNorm.includes(target) || target.includes(firstNorm))) best = first;
    }
    
    // Fallback: If RAWG returned results but none perfectly matched string equality,
    // we take the first result as Steam games usually map 1-1 with RAWG's top search result.
    if (!best && list.length > 0) {
        best = list[0];
    }

    if (best) matches.set(item.appid, best);
  });

  return matches;
}

/** Merge Steam + RAWG data into the app's normalized game shape. */
export function buildSyncedGame(steamGame: SteamOwnedGame, rawgGame?: any, appDetails?: SteamAppDetails | null) {
  const mapped = rawgGame ? mapRawgGame(rawgGame) : null;

  return {
    title: mapped?.title || appDetails?.name || steamGame.name,
    year: mapped?.year ?? null,
    rawg_id: mapped?.rawg_id ?? null,
    genres: mapped?.genres ?? [],
    synopsis:
      mapped?.synopsis ??
      (appDetails?.short_description?.trim()
        ? appDetails.short_description.trim()
        : "No synopsis available."),
    poster_url: getSteamPosterImage(steamGame.appid),
    critic_score: mapped?.critic_score ?? null,
    owned_platforms: ["steam"],
    steam_appid: steamGame.appid,
    playtime: Math.round((steamGame.playtime_forever || 0) / 60),
  };
}


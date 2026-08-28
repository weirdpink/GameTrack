import { create } from "zustand";
import {
  Game, LibrarySummary,
  GenreAnalytics, NextToPlaySuggestion,
  IGDBGame, SteamSettings, DiscoverLists, CustomizationSettings, WishlistItem, ManualWishlistEntry,
  PlayingConflict
} from "./types";
import { isThemeId, applyTheme, applyThemeWithReboot } from "./themes";
import { Platform, slugifyPlatformLabel, mergeCustomPlatforms } from "./constants";

export interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  /** Optional secondary line — keeps the title short and scannable. */
  description?: string;
  duration: number;
}

// One auto-dismiss timer per toast, so the queue can pause/resume/dismiss
// individual notifications without affecting the others.
const toastTimers = new Map<number, NodeJS.Timeout>();
const toastDeadlines = new Map<number, number>();
let toastIdCounter = 0;

function scheduleToastDismiss(
  id: number,
  duration: number,
  set: (fn: (state: GameTrackState) => Partial<GameTrackState>) => void
) {
  const deadline = Date.now() + duration;
  toastDeadlines.set(id, deadline);
  toastTimers.set(
    id,
    setTimeout(() => {
      toastTimers.delete(id);
      toastDeadlines.delete(id);
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration)
  );
}

// Abort the previous /api/discover/search when a new one starts, so stale
// responses can never clobber fresher results.
let searchController: AbortController | null = null;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Extract the server's JSON `{ error }` message for friendlier toasts. */
async function getApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") return new Error(body.error);
  } catch { /* not JSON */ }
  return new Error(fallback);
}

// fetchAnalytics silently drops a refresh that arrives while one is in flight
// (e.g. an add/delete during an initial analytics load). Queue the latest
// request and replay it once the current one settles so refreshes are never lost.
let analyticsRefetchQueued = false;

async function syncGameField(id: number, igdbId: number, field: "synopsis" | "poster_url", set: (fn: (state: GameTrackState) => Partial<GameTrackState>) => void) {
  try {
    const res = await fetch(`/api/discover/game/${igdbId}`);
    if (res.ok) {
      const data = await res.json();
      if (data[field]) {
        const putRes = await fetch(`/api/games/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: data[field] }),
        });
        if (!putRes.ok) return null; // don't apply a value the server rejected
        set((state: GameTrackState) => ({
          games: state.games.map((g: Game) => g.id === id ? { ...g, [field]: data[field] } : g),
          selectedGame: state.selectedGame?.id === id ? { ...state.selectedGame, [field]: data[field] } : state.selectedGame,
        }));
        return data[field];
      }
    }
  } catch (err) {
    console.error(`Failed to sync game ${field}:`, err);
  }
  return null;
}

interface GameTrackState {
  activeTab: "dashboard" | "library" | "discover" | "analytics" | "wishlist";
  setActiveTab: (tab: "dashboard" | "library" | "discover" | "analytics" | "wishlist") => void;
  selectedGame: Game | null;
  setSelectedGame: (game: Game | null) => void;
  isAddGameOpen: boolean;
  setAddGameOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  playingConflict: PlayingConflict | null;
  openPlayingConflict: (conflict: PlayingConflict) => void;
  closePlayingConflict: () => void;

  games: Game[];
  loadingGames: boolean;
  lastGamesFetch: number;
  gamesError: string | null;
  filters: { status: string; platform: string; sort: string; search: string };
  setFilter: (key: "status" | "platform" | "sort" | "search", value: string) => void;
  resetFilters: () => void;
  fetchGames: (force?: boolean) => Promise<void>;
  addGame: (gameData: Partial<Game>) => Promise<boolean>;
  updateGame: (id: number, gameData: Partial<Game>) => Promise<boolean>;
  deleteGame: (id: number) => Promise<boolean>;
  deleteGames: (ids: number[]) => Promise<boolean>;
  updateCustomOrder: (ids: number[]) => Promise<boolean>;
  clearCustomOrder: () => Promise<boolean>;
  syncGameSynopsis: (id: number, igdbId: number) => Promise<string | null>;
  syncGamePoster: (id: number, igdbId: number) => Promise<string | null>;

  trendingGames: IGDBGame[];
  discoverSearchResults: IGDBGame[];
  discoverQuery: string;
  loadingDiscover: boolean;
  discoverError: string | null;
  trendingPage: number;
  searchPage: number;
  hasMoreTrending: boolean;
  hasMoreSearch: boolean;
  discoverLists: DiscoverLists | null;
  loadingLists: boolean;
  lastListsFetch: number;
  lastTrendingFetch: number;
  fetchTrending: (loadMore?: boolean) => Promise<void>;
  searchDiscover: (query: string, loadMore?: boolean) => Promise<void>;
  fetchDiscoverLists: () => Promise<void>;
  addGameFromIgdb: (igdbGame: IGDBGame) => Promise<boolean>;

  wishlist: WishlistItem[];
  loadingWishlist: boolean;
  lastWishlistFetch: number;
  fetchWishlist: (force?: boolean) => Promise<void>;
  addToWishlist: (igdbGame: IGDBGame | ManualWishlistEntry) => Promise<boolean>;
  removeFromWishlist: (id: number) => Promise<boolean>;
  removeWishlistItems: (ids: number[], silent?: boolean) => Promise<boolean>;
  ownWishlistItem: (id: number) => Promise<boolean>;

  summary: LibrarySummary | null;
  genreAnalytics: GenreAnalytics[];
  suggestions: NextToPlaySuggestion[];
  recentActivity: Game[];
  loadingAnalytics: boolean;
  lastAnalyticsFetch: number;
  fetchAnalytics: () => Promise<void>;
  fetchSuggestions: () => Promise<void>;

  importLibraryJSON: (jsonData: unknown) => Promise<{ success: boolean; imported?: number; error?: string }>;
  wipeLibrary: () => Promise<boolean>;
  exportLibraryJSON: () => Promise<boolean>;

  toasts: ToastItem[];
  showToast: (message: string, type?: "success" | "error" | "info", description?: string, duration?: number) => void;
  dismissToast: (id: number) => void;
  pauseToast: (id: number) => void;
  resumeToast: (id: number) => void;

  steamSettings: SteamSettings | null;
  fetchSteamSettings: () => Promise<void>;
  saveSteamSettings: (profile: string) => Promise<boolean>;
  syncSteamLibrary: () => Promise<{ ok: boolean; imported?: number; updated?: number; adopted?: number; total?: number; error?: string } | null>;

  customPlatforms: Platform[];
  fetchCustomPlatforms: () => Promise<void>;
  addCustomPlatform: (label: string) => Promise<boolean>;
  removeCustomPlatform: (id: string) => Promise<boolean>;
  _saveCustomPlatforms: (platforms: Platform[]) => Promise<boolean>;

  isAuthOpen: boolean;
  setAuthOpen: (open: boolean) => void;

  customizations: CustomizationSettings;
  updateCustomizations: (partial: Partial<CustomizationSettings>) => void;
}

const TAB_KEY = "gametrack_active_tab";
// Wishlist is a full page but has no sidebar entry (it's opened from the
// Library header), so it must never be restored on reload.
const VALID_TABS = ["dashboard", "library", "discover", "analytics"] as const;

function getInitialTab(): GameTrackState["activeTab"] {
  const stored = localStorage.getItem(TAB_KEY);
  return (VALID_TABS as readonly string[]).includes(stored || "") ? stored as GameTrackState["activeTab"] : "dashboard";
}

const FILTERS_KEY = "gametrack_library_filters";
const DEFAULT_FILTERS = { status: "", platform: "", sort: "recent", search: "" };

function loadSavedFilters(): GameTrackState["filters"] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTERS_KEY) || "");
    return {
      status: typeof parsed.status === "string" ? parsed.status : DEFAULT_FILTERS.status,
      platform: typeof parsed.platform === "string" ? parsed.platform : DEFAULT_FILTERS.platform,
      sort: typeof parsed.sort === "string" ? parsed.sort : DEFAULT_FILTERS.sort,
      search: typeof parsed.search === "string" ? parsed.search : DEFAULT_FILTERS.search,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

const CUSTOMIZATIONS_KEY = "gametrack_customization_settings";
const DEFAULT_CUSTOMIZATIONS: CustomizationSettings = {
  theme: "noir",
  libraryColumns: 5,
  discoverColumns: 6,
  showPlaytimeBadge: true,
  showRatingBadge: true,
};

function loadSavedCustomizations(): CustomizationSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOMIZATIONS_KEY) || "");
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_CUSTOMIZATIONS.theme,
      libraryColumns: [3, 4, 5, 6, 7].includes(parsed.libraryColumns) ? parsed.libraryColumns : 5,
      discoverColumns: [3, 4, 5, 6, 7].includes(parsed.discoverColumns) ? parsed.discoverColumns : 6,
      showPlaytimeBadge: typeof parsed.showPlaytimeBadge === "boolean" ? parsed.showPlaytimeBadge : true,
      showRatingBadge: typeof parsed.showRatingBadge === "boolean" ? parsed.showRatingBadge : true,
    };
  } catch {
    return DEFAULT_CUSTOMIZATIONS;
  }
}

// Apply the persisted theme before React mounts to avoid a flash of the
// default theme. Safe to run at module scope: this store is client-only.
const initialCustomizations = loadSavedCustomizations();
applyTheme(initialCustomizations.theme);

// Cache the last analytics payload so a reload paints instantly instead of
// flashing loading states while /api/analytics is in flight. Refreshed on
// every successful fetch.
const ANALYTICS_CACHE_KEY = "gametrack_analytics_cache";

function loadCachedAnalytics() {
  try {
    const raw = localStorage.getItem(ANALYTICS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.savedAt !== "number" ||
      typeof parsed.summary?.total_games !== "number" ||
      !Array.isArray(parsed.genreAnalytics) ||
      !Array.isArray(parsed.recentActivity)
    ) {
      return null;
    }
    return parsed as {
      savedAt: number;
      summary: LibrarySummary;
      genreAnalytics: GenreAnalytics[];
      recentActivity: Game[];
    };
  } catch {
    return null;
  }
}

const cachedAnalytics = loadCachedAnalytics();

// Cache the last Discover payload (trending feed + curated lists) so a reload
// paints cards instantly instead of waiting on IGDB round-trips. Refreshed on
// every successful fetch.
const DISCOVER_CACHE_KEY = "gametrack_discover_cache";

function loadCachedDiscover() {
  try {
    const raw = localStorage.getItem(DISCOVER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.trendingGames) ||
      (parsed.discoverLists !== null && typeof parsed.discoverLists !== "object")
    ) {
      return null;
    }
    return parsed as {
      savedAt: number;
      trendingGames: IGDBGame[];
      trendingPage: number;
      hasMoreTrending: boolean;
      discoverLists: DiscoverLists | null;
    };
  } catch {
    return null;
  }
}

const cachedDiscover = loadCachedDiscover();

function saveDiscoverCache(snapshot: {
  savedAt: number;
  trendingGames: IGDBGame[];
  trendingPage: number;
  hasMoreTrending: boolean;
  discoverLists: DiscoverLists | null;
}) {
  try {
    localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage full or unavailable — cache is best-effort */
  }
}

export const useGameTrackStore = create<GameTrackState>((set, get) => ({
  activeTab: getInitialTab(),
  setActiveTab: (tab) => {
    if (tab !== "wishlist") {
      localStorage.setItem(TAB_KEY, tab);
    }
    set({ activeTab: tab, selectedGame: null });
  },
  selectedGame: null,
  setSelectedGame: (game) => {
    // Note: synopsis/poster enrichment happens in GameDetailsModal's own
    // effect — firing it here too would double-PATCH the same game on open.
    set({ selectedGame: game });
  },
  isAddGameOpen: false,
  setAddGameOpen: (open) => set({ isAddGameOpen: open }),
  isSettingsOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  playingConflict: null,
  openPlayingConflict: (conflict) => set({ playingConflict: conflict }),
  closePlayingConflict: () => set({ playingConflict: null }),

  customizations: initialCustomizations,
  updateCustomizations: (partial) => {
    const next = { ...get().customizations, ...partial };
    localStorage.setItem(CUSTOMIZATIONS_KEY, JSON.stringify(next));
    set({ customizations: next });
    if (partial.theme && isThemeId(partial.theme)) {
      applyThemeWithReboot(partial.theme);
    }
  },

  games: [],
  loadingGames: false,
  lastGamesFetch: 0,
  gamesError: null,
  filters: loadSavedFilters(),
  setFilter: (key, value) => {
    set((state) => {
      const filters = { ...state.filters, [key]: value };
      try {
        localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
      } catch {
        /* ignore */
      }
      return { filters };
    });
  },
  resetFilters: () => {
    try {
      localStorage.removeItem(FILTERS_KEY);
    } catch {
      /* ignore */
    }
    set({ filters: DEFAULT_FILTERS });
  },

  fetchGames: async (force = false) => {
    // Skip refetches within 60s of the last successful load — Tab switches,
    // boot preloads and component remounts all land on this guard.
    if (!force && get().games.length > 0 && Date.now() - get().lastGamesFetch < 60_000) return;
    set({ loadingGames: true, gamesError: null });
    try {
      const res = await fetch("/api/games");
      if (!res.ok) throw new Error("Failed to fetch games");
      const data = await res.json();
      set({ games: data, lastGamesFetch: Date.now() });
    } catch (err: unknown) {
      set({ gamesError: getErrorMessage(err) || "Error loading games" });
      get().showToast(getErrorMessage(err) || "Error loading games", "error");
    } finally {
      set({ loadingGames: false });
    }
  },

  addGame: async (gameData) => {
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gameData),
      });
      if (!res.ok) throw await getApiError(res, "Failed to add game");
      const data = await res.json();

      set((state) => ({ games: [data, ...state.games] }));
      get().fetchAnalytics();
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error adding game", "error");
      return false;
    }
  },

  updateGame: async (id, gameData) => {
    try {
      const res = await fetch(`/api/games/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gameData),
      });
      if (!res.ok) throw await getApiError(res, "Failed to update game");
      const data = await res.json();

      set((state) => ({
        games: state.games.map((g) => (g.id === id ? data : g)),
        selectedGame: state.selectedGame?.id === id ? data : state.selectedGame,
      }));
      get().fetchAnalytics();
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error updating game", "error");
      return false;
    }
  },

  deleteGame: async (id) => {
    try {
      const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete game");

      set((state) => ({
        games: state.games.filter((g) => g.id !== id),
        selectedGame: state.selectedGame?.id === id ? null : state.selectedGame,
      }));
      get().showToast("Game removed from library", "info");
      get().fetchAnalytics();
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error deleting game", "error");
      return false;
    }
  },

  deleteGames: async (ids) => {
    try {
      const res = await fetch("/api/games/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          let count = 0;
          for (const id of ids) {
            const singleRes = await fetch(`/api/games/${id}`, { method: "DELETE" });
            if (singleRes.ok) count++;
          }
          const idSet = new Set(ids);
          set((state) => ({
            games: state.games.filter((g) => !idSet.has(g.id)),
            selectedGame: state.selectedGame && idSet.has(state.selectedGame.id) ? null : state.selectedGame,
          }));
          get().showToast(`Deleted ${count} ${count === 1 ? "game" : "games"}`, "info");
          get().fetchAnalytics();
          return true;
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete games");
      }
      const idSet = new Set(ids);
      set((state) => ({
        games: state.games.filter((g) => !idSet.has(g.id)),
        selectedGame: state.selectedGame && idSet.has(state.selectedGame.id) ? null : state.selectedGame,
      }));
      get().showToast(`Deleted ${ids.length} ${ids.length === 1 ? "game" : "games"}`, "info");
      get().fetchAnalytics();
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error deleting games", "error");
      return false;
    }
  },

  updateCustomOrder: async (ids) => {
    try {
      const res = await fetch("/api/games/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw await getApiError(res, "Failed to save game order");
      const data = await res.json();

      const position = new Map<number, number>(ids.map((id, index) => [id, index]));
      set((state) => ({
        games: data as Game[],
        selectedGame: state.selectedGame?.id != null && position.has(state.selectedGame.id)
          ? { ...state.selectedGame, custom_order: position.get(state.selectedGame.id)! }
          : state.selectedGame,
      }));
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error saving game order", "error");
      return false;
    }
  },

  clearCustomOrder: async () => {
    try {
      const res = await fetch("/api/games/order", { method: "DELETE" });
      if (!res.ok) throw await getApiError(res, "Failed to reset game order");
      const data = await res.json();
      set((state) => ({
        games: data as Game[],
        selectedGame: state.selectedGame?.id != null
          ? { ...state.selectedGame, custom_order: null }
          : state.selectedGame,
      }));
      get().showToast("Custom order reset", "info");
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error resetting game order", "error");
      return false;
    }
  },

  syncGameSynopsis: (id, igdbId) => syncGameField(id, igdbId, "synopsis", set),
  syncGamePoster: (id, igdbId) => syncGameField(id, igdbId, "poster_url", set),

  // ── Discover (IGDB) ───────────────────────────────────────────
  trendingGames: cachedDiscover?.trendingGames ?? [],
  discoverSearchResults: [],
  discoverQuery: "",
  loadingDiscover: false,
  discoverError: null,
  trendingPage: cachedDiscover?.trendingPage ?? 1,
  searchPage: 1,
  hasMoreTrending: cachedDiscover?.hasMoreTrending ?? true,
  hasMoreSearch: true,
  discoverLists: cachedDiscover?.discoverLists ?? null,
  loadingLists: false,
  lastListsFetch: cachedDiscover?.savedAt ?? 0,
  lastTrendingFetch: cachedDiscover?.savedAt ?? 0,

  fetchDiscoverLists: async () => {
    if (get().loadingLists) return;
    set({ loadingLists: true });
    try {
      const res = await fetch("/api/discover/lists");
      if (!res.ok) throw new Error("Failed to load curated lists");
      const data = await res.json();
      const ts = Date.now();
      set({ discoverLists: data, lastListsFetch: ts });
      saveDiscoverCache({
        savedAt: ts,
        trendingGames: get().trendingGames,
        trendingPage: get().trendingPage,
        hasMoreTrending: get().hasMoreTrending,
        discoverLists: data,
      });
    } catch (err: unknown) {
      console.error("Failed to load curated lists:", err);
      get().showToast("Could not load curated lists. The registry is temporarily unreachable.", "error");
    } finally {
      set({ loadingLists: false });
    }
  },

  fetchTrending: async (loadMore = false) => {
    if (get().loadingDiscover) return;
    const nextPage = loadMore ? get().trendingPage + 1 : 1;
    if (loadMore && !get().hasMoreTrending) return;

    // Load two full rows per batch based on the configured grid columns.
    const pageSize = get().customizations.discoverColumns * 2;

    set({ loadingDiscover: true, discoverError: null });
    try {
      const res = await fetch(`/api/discover/trending?page=${nextPage}&limit=${pageSize}`);
      if (!res.ok) throw new Error("Failed to load trending games");
      const data = await res.json();

      set((state) => ({
        trendingGames: loadMore ? [...state.trendingGames, ...data] : data,
        trendingPage: nextPage,
        hasMoreTrending: data.length > 0 && data.length === pageSize,
        discoverError: null,
      }));
      saveDiscoverCache({
        savedAt: Date.now(),
        trendingGames: get().trendingGames,
        trendingPage: nextPage,
        hasMoreTrending: data.length > 0 && data.length === pageSize,
        discoverLists: get().discoverLists,
      });
      set({ lastTrendingFetch: Date.now() });
    } catch (err: unknown) {
      console.error(err);
      set({
        discoverError: loadMore ? null : "Could not reach the game registry. The discovery service is temporarily unavailable. Please try again in a moment.",
      });
    } finally {
      set({ loadingDiscover: false });
    }
  },

  searchDiscover: async (query, loadMore = false) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      // Clearing the box aborts any in-flight search and releases the loader.
      searchController?.abort();
      searchController = null;
      set({ discoverSearchResults: [], discoverQuery: "", searchPage: 1, hasMoreSearch: true, discoverError: null, loadingDiscover: false });
      return;
    }
    const nextPage = loadMore ? get().searchPage + 1 : 1;
    if (loadMore && !get().hasMoreSearch) return;

    // Sequence requests: a new search aborts the previous in-flight one so a
    // slow stale response can never overwrite fresher results.
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;

    set({ loadingDiscover: true, discoverError: null });
    try {
      const res = await fetch(`/api/discover/search?q=${encodeURIComponent(trimmedQuery)}&page=${nextPage}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Failed to search games");
      const data = await res.json();

      if (controller.signal.aborted) return; // superseded by a newer search
      set((state) => ({
        discoverSearchResults: loadMore ? [...state.discoverSearchResults, ...data] : data,
        discoverQuery: trimmedQuery,
        searchPage: nextPage,
        hasMoreSearch: data.length > 0 && data.length === 15,
        discoverError: null,
      }));
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      get().showToast(getErrorMessage(err) || "Error searching games", "error");
      set({
        discoverError: loadMore
          ? null
          : "Search failed — the game registry is temporarily unreachable. Please try again in a moment.",
      });
    } finally {
      if (!controller.signal.aborted) set({ loadingDiscover: false });
    }
  },

  addGameFromIgdb: async (igdbGame) => {
    try {
      // Fetch full details from IGDB and merge everything so library entries
      // have the same rich metadata as the library page details modal
      let merged = igdbGame;
      if (igdbGame.igdb_id) {
        try {
          const detailRes = await fetch(`/api/discover/game/${igdbGame.igdb_id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            merged = { ...igdbGame, ...detailData };
          }
        } catch (e) {
          console.error("Failed to fetch full game details:", e);
        }
      }

      // Check for duplicates
      const existingGame = get().games.find(
        (g) => g.igdb_id === igdbGame.igdb_id || 
               (g.title.toLowerCase() === igdbGame.title.toLowerCase() && !g.igdb_id)
      );
      if (existingGame) {
        throw new Error("This game already exists in your library.");
      }

      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: merged.title,
          year: merged.year,
          igdb_id: merged.igdb_id,
          genres: merged.genres || [],
          synopsis: merged.synopsis || "",
          poster_url: merged.poster_url || "",
          critic_score: merged.critic_score,
          owned_platforms: merged.owned_platforms || [],
          status: "backlog",
          playtime: 0,
          personal_rating: null,
        }),
      });
      if (!res.ok) throw await getApiError(res, "Failed to add game");
      const data = await res.json();

      get().showToast("Added to backlog", "success", data.title);
      set((state) => ({ games: [data, ...state.games] }));
      // Adding to the library should retire the wishlist entry for the same
      // game, if one exists — keeps the two lists from drifting apart.
      const wishlistDup = get().wishlist.find((w) => w.igdb_id === igdbGame.igdb_id);
      if (wishlistDup) {
        await get().removeWishlistItems([wishlistDup.id], true);
      }
      get().fetchAnalytics();
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error adding game", "error");
      return false;
    }
  },

  // ── Wishlist ────────────────────────────────────────────────────
  wishlist: [],
  loadingWishlist: false,
  lastWishlistFetch: 0,

  fetchWishlist: async (force = false) => {
    if (!force && get().wishlist.length > 0 && Date.now() - get().lastWishlistFetch < 60_000) return;
    set({ loadingWishlist: true });
    try {
      const res = await fetch("/api/wishlist");
      if (!res.ok) throw new Error("Failed to fetch wishlist");
      const data = await res.json();
      set({ wishlist: data, lastWishlistFetch: Date.now() });
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error loading wishlist", "error");
    } finally {
      set({ loadingWishlist: false });
    }
  },

  addToWishlist: async (igdbGame: IGDBGame | ManualWishlistEntry) => {
    try {
      // Merge full IGDB details so entries carry the same rich metadata as
      // library rows (poster, synopsis, critic score, platforms). Every
      // IGDB-sourced payload (search/trending/lists/detail) is already fully
      // normalized, so only enrich when a caller passes a partial object.
      let merged = igdbGame;
      const needsEnrichment =
        igdbGame.igdb_id != null && (!igdbGame.synopsis || !igdbGame.poster_url);
      if (needsEnrichment) {
        try {
          const detailRes = await fetch(`/api/discover/game/${igdbGame.igdb_id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            merged = { ...igdbGame, ...detailData };
          }
        } catch (e) {
          console.error("Failed to fetch full game details:", e);
        }
      }

      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: merged.title,
          year: merged.year,
          igdb_id: merged.igdb_id,
          genres: merged.genres || [],
          synopsis: merged.synopsis || "",
          poster_url: merged.poster_url || "",
          critic_score: merged.critic_score,
          owned_platforms: merged.owned_platforms || [],
        }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Already in wishlist or library");
      }
      if (!res.ok) throw new Error("Failed to add to wishlist");
      const item = await res.json();

      get().showToast("Added to wishlist", "success", item.title);
      set((state) => ({ wishlist: [item, ...state.wishlist] }));
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error adding to wishlist", "error");
      return false;
    }
  },

  removeFromWishlist: async (id) => {
    try {
      const res = await fetch(`/api/wishlist/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to remove from wishlist");
      }
      set((state) => ({ wishlist: state.wishlist.filter((item) => item.id !== id) }));
      get().showToast("Removed from wishlist", "info");
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error removing from wishlist", "error");
      return false;
    }
  },

  removeWishlistItems: async (ids, silent = false) => {
    try {
      const res = await fetch("/api/wishlist/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          let count = 0;
          for (const id of ids) {
            const singleRes = await fetch(`/api/wishlist/${id}`, { method: "DELETE" });
            if (singleRes.ok) count++;
          }
          const idSet = new Set(ids);
          set((state) => ({
            wishlist: state.wishlist.filter((item) => !idSet.has(item.id)),
          }));
          if (!silent) get().showToast(`Removed ${count} ${count === 1 ? "item" : "items"} from wishlist`, "info");
          return true;
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to remove wishlist items");
      }
      const idSet = new Set(ids);
      set((state) => ({
        wishlist: state.wishlist.filter((item) => !idSet.has(item.id)),
      }));
      if (!silent) get().showToast(`Removed ${ids.length} ${ids.length === 1 ? "item" : "items"} from wishlist`, "info");
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error removing wishlist items", "error");
      return false;
    }
  },

  ownWishlistItem: async (id) => {
    try {
      const res = await fetch(`/api/wishlist/${id}/own`, { method: "POST" });
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Already in your library");
      }
      if (!res.ok) throw new Error("Failed to move game to library");
      const data = await res.json();

      set((state) => ({
        games: [data.game, ...state.games],
        wishlist: state.wishlist.filter((item) => item.id !== id),
      }));
      get().fetchAnalytics();
      get().showToast("Added to backlog", "success", data.game.title);
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Error moving game to library", "error");
      return false;
    }
  },

  // ── Analytics ──────────────────────────────────────────────────
  summary: cachedAnalytics?.summary ?? null,
  genreAnalytics: cachedAnalytics?.genreAnalytics ?? [],
  suggestions: [],
  recentActivity: cachedAnalytics?.recentActivity ?? [],
  loadingAnalytics: false,
  lastAnalyticsFetch: cachedAnalytics?.savedAt ?? 0,

  fetchAnalytics: async () => {
    if (get().loadingAnalytics) {
      analyticsRefetchQueued = true;
      return;
    }
    set({ loadingAnalytics: true });
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const data = await res.json();
      const ts = Date.now();

      set({
        summary: data.summary,
        genreAnalytics: data.genreAnalytics,
        recentActivity: data.recentActivity,
        lastAnalyticsFetch: ts,
      });

      try {
        localStorage.setItem(ANALYTICS_CACHE_KEY, JSON.stringify({
          savedAt: ts,
          summary: data.summary,
          genreAnalytics: data.genreAnalytics,
          recentActivity: data.recentActivity,
        }));
      } catch {
        /* storage full or unavailable — cache is best-effort */
      }
    } catch (err: unknown) {
      console.error("Failed to load analytics:", err);
      get().showToast("Failed to load analytics. Please try again in a moment.", "error");
    } finally {
      set({ loadingAnalytics: false });
      if (analyticsRefetchQueued) {
        analyticsRefetchQueued = false;
        get().fetchAnalytics();
      }
    }
  },

  fetchSuggestions: async () => {
    try {
      const games = get().games;

      let candidates = games.filter((g) => {
        if (g.status !== "backlog") return false;
        const genres = Array.isArray(g.genres) ? g.genres : [];
        const hasExcluded = genres.some((genre) => {
          const lower = genre.toLowerCase();
          return lower.includes("multiplayer") || lower.includes("endless") || lower.includes("co-op") || lower === "mmo" || lower === "massively multiplayer";
        });
        return !hasExcluded;
      });

      if (candidates.length === 0) {
        candidates = games.filter((g) => g.status === "backlog");
      }

      if (candidates.length === 0) {
        candidates = games;
      }

      const shuffled = [...candidates];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
      }
      const selected = shuffled.slice(0, 1);

      set({ suggestions: selected });
    } catch (err: unknown) {
      console.error("Failed to fetch suggestions:", err);
    }
  },

  // ── Import / Export ────────────────────────────────────────────
  importLibraryJSON: async (jsonData: unknown) => {
    try {
      // Accept either a bare array of games or a `{ games: [...] }` backup wrapper.
      const obj = jsonData as Record<string, unknown> | unknown[];
      const rawGames = Array.isArray(obj)
        ? obj
        : (Array.isArray((obj as Record<string, unknown>)?.games) ? (obj as Record<string, unknown>).games as unknown[] : []);
      if (!rawGames.length) throw new Error("No games found in JSON");

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: rawGames }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");

      let desc = `${result.imported} games added`;
      if (result.duplicates > 0) desc += ` · ${result.duplicates} duplicates skipped`;
      else if (result.skipped > 0) desc += ` · ${result.skipped} skipped`;
      get().showToast("Library import complete", "success", desc);
      get().fetchGames(true);
      get().fetchAnalytics();
      return { success: true, imported: result.imported };
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      get().showToast(msg || "Library import failed", "error");
      return { success: false, error: msg };
    }
  },

  wipeLibrary: async () => {
    try {
      const res = await fetch("/api/wipe", { method: "DELETE" });
      if (!res.ok) throw new Error("Wipe failed");

      set({ games: [], selectedGame: null, suggestions: [] });
      get().showToast("Library wiped", "success", "All local data cleared");
      get().fetchAnalytics();
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Wipe failed", "error");
      return false;
    }
  },

  exportLibraryJSON: async () => {
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gametrack-library-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      get().showToast("Library exported", "success", "Backup saved to downloads");
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Library export failed", "error");
      return false;
    }
  },

  // ── Toasts (queue) ─────────────────────────────────────────────
  toasts: [],
  showToast: (message, type = "info", description, duration) => {
    const id = ++toastIdCounter;
    const ms = duration ?? (type === "error" ? 6000 : type === "info" ? 3500 : 4000);
    set((state) => ({ toasts: [...state.toasts, { id, message, type, description, duration: ms }] }));
    scheduleToastDismiss(id, ms, set);
  },
  dismissToast: (id) => {
    toastTimers.delete(id);
    toastDeadlines.delete(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  pauseToast: (id) => {
    const timer = toastTimers.get(id);
    const deadline = toastDeadlines.get(id);
    if (!timer || deadline === undefined) return;
    clearTimeout(timer);
    toastTimers.delete(id);
    toastDeadlines.set(id, Math.max(0, deadline - Date.now()));
  },
  resumeToast: (id) => {
    const remaining = toastDeadlines.get(id);
    if (remaining === undefined || remaining <= 0 || toastTimers.has(id)) return;
    scheduleToastDismiss(id, remaining, set);
  },

  // ── Steam Sync ────────────────────────────────────────────────
  steamSettings: null,

  fetchSteamSettings: async () => {
    try {
      const res = await fetch("/api/settings/steam");
      if (!res.ok) throw new Error("Failed to fetch Steam settings");
      const data = await res.json();
      set({ steamSettings: data });
    } catch (err) {
      console.error("Failed to fetch Steam settings:", err);
    }
  },

  saveSteamSettings: async (profile) => {
    try {
      const res = await fetch("/api/settings/steam", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to connect Steam account");
      }
      const data = await res.json();
      set({ steamSettings: data });
      get().showToast("Steam linked", "success", data.steamName || "connected");
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Failed to connect Steam", "error");
      return false;
    }
  },

  syncSteamLibrary: async () => {
    try {
      const res = await fetch("/api/sync/steam", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Steam sync failed");
      }
      set((state) => ({
        steamSettings: state.steamSettings ? { ...state.steamSettings, lastSync: data.lastSync } : state.steamSettings,
      }));
      get().showToast(
        "Steam sync complete",
        "success",
        `${data.imported} imported · ${data.adopted} adopted · ${data.updated} updated`
      );
      get().fetchGames(true);
      get().fetchAnalytics();
      return { ok: true, imported: data.imported, updated: data.updated, adopted: data.adopted, total: data.total };
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      get().showToast(msg || "Steam sync failed", "error");
      return { ok: false, error: msg };
    }
  },

  // ── Custom Platform Tags ─────────────────────────────────────
  customPlatforms: [],

  fetchCustomPlatforms: async () => {
    try {
      const res = await fetch("/api/settings/platforms");
      if (!res.ok) throw new Error("Failed to fetch custom platforms");
      const data = await res.json();
      set({ customPlatforms: Array.isArray(data.platforms) ? data.platforms : [] });
    } catch (err) {
      console.error("Failed to fetch custom platforms:", err);
    }
  },

  _saveCustomPlatforms: async (platforms: Platform[]) => {
    try {
      const res = await fetch("/api/settings/platforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
      if (!res.ok) throw new Error("Failed to save custom platforms");
      const data = await res.json();
      set({ customPlatforms: Array.isArray(data.platforms) ? data.platforms : [] });
      return true;
    } catch (err: unknown) {
      get().showToast(getErrorMessage(err) || "Failed to save custom platforms", "error");
      return false;
    }
  },

  addCustomPlatform: async (label) => {
    const trimmed = label.trim();
    if (!trimmed) {
      get().showToast("Tag label is required", "error");
      return false;
    }
    const effective = mergeCustomPlatforms(get().customPlatforms);
    if (effective.some((p) => p.label.toLowerCase() === trimmed.toLowerCase())) {
      get().showToast("That platform tag already exists", "error");
      return false;
    }
    if (get().customPlatforms.length >= 20) {
      get().showToast("Custom tags are capped at 20", "error");
      return false;
    }
    const slug = slugifyPlatformLabel(trimmed);
    if (!slug) {
      get().showToast("Tag label must contain letters or numbers", "error");
      return false;
    }
    const next = [...get().customPlatforms, { id: slug, label: trimmed }];
    const ok = await get()._saveCustomPlatforms(next);
    if (ok) get().showToast("Platform tag added", "success", trimmed);
    return ok;
  },

  removeCustomPlatform: async (id) => {
    const next = get().customPlatforms.filter((p) => p.id !== id);
    const ok = await get()._saveCustomPlatforms(next);
    if (ok) get().showToast("Platform tag removed", "info");
    return ok;
  },

  // ── Local Auth (cosmetic) ────────────────────────────────────
  isAuthOpen: false,
  setAuthOpen: (open) => set({ isAuthOpen: open }),
}));

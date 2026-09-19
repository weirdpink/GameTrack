import { describe, it, expect } from "vitest";
import { mapIgdbGame, getIgdbImageUrl, upgradeIgdbPosterUrl } from "../server/igdb";
import { isNonGameApp } from "../server/steam";
import { normalizePlatformIds } from "../src/constants";
import { upgradeIgdbPosterUrl as clientUpgrade } from "../src/utils/image";

describe("mapIgdbGame", () => {
  it("emits the highest-quality WebP cover preset", () => {
    const mapped = mapIgdbGame({ id: 1, name: "Test", cover: { image_id: "co1q1f" } });
    expect(mapped.poster_url).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1q1f.webp"
    );
  });

  it("returns null poster without a cover", () => {
    expect(mapIgdbGame({ id: 2, name: "No Art" }).poster_url).toBeNull();
  });

  it("derives the year in UTC", () => {
    // 2024-01-01T00:30:00Z — local-timezone getFullYear could say 2023.
    const mapped = mapIgdbGame({ id: 3, name: "NYE", first_release_date: 1704069000 });
    expect(mapped.year).toBe(2024);
  });
});

describe("getIgdbImageUrl", () => {
  it("defaults to the retina cover preset in WebP", () => {
    expect(getIgdbImageUrl("co1q1f")).toMatch(/t_cover_big_2x\/co1q1f\.webp$/);
  });

  it("returns null for missing ids", () => {
    expect(getIgdbImageUrl(undefined)).toBeNull();
    expect(getIgdbImageUrl(null)).toBeNull();
  });
});

describe.each([
  ["server", upgradeIgdbPosterUrl],
  ["client", clientUpgrade],
] as const)("upgradeIgdbPosterUrl (%s)", (_label, upgrade) => {
  it("upgrades legacy jpg covers to retina WebP", () => {
    expect(
      upgrade("https://images.igdb.com/igdb/image/upload/t_cover_big/co1q1f.jpg")
    ).toBe("https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1q1f.webp");
  });

  it("is idempotent for already-upgraded URLs", () => {
    const url = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1q1f.webp";
    expect(upgrade(url)).toBe(url);
  });

  it("leaves Steam CDN and local uploads untouched", () => {
    const steam = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg";
    const local = "/posters/123-abc.jpg";
    expect(upgrade(steam)).toBe(steam);
    expect(upgrade(local)).toBe(local);
  });

  it("passes through nullish input", () => {
    expect(upgrade(null)).toBeNull();
    expect(upgrade(undefined)).toBeUndefined();
  });
});

describe("isNonGameApp", () => {
  it("flags known software and benchmarks", () => {
    expect(isNonGameApp(431960, "Wallpaper Engine")).toBe(true);
    expect(isNonGameApp(999999, "3DMark Demo")).toBe(true);
  });

  it("keeps real games", () => {
    expect(isNonGameApp(10, "Counter-Strike")).toBe(false);
  });

  it("flags software-typed store entries", () => {
    expect(isNonGameApp(1, "Some Tool", { type: "tool" })).toBe(true);
    expect(isNonGameApp(2, "Real Game", { type: "game" })).toBe(false);
  });
});

describe("normalizePlatformIds", () => {
  it("canonicalizes aliases and drops unknowns", () => {
    expect(normalizePlatformIds(["Steam", "  PC  ", "bogus-platform"])).toContain("steam");
  });

  it("tolerates nullish input", () => {
    expect(normalizePlatformIds(null)).toEqual([]);
    expect(normalizePlatformIds(undefined)).toEqual([]);
  });
});

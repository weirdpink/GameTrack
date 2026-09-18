import type { Collection, Game } from "../types";
import { formatPlaytimePrecise } from "./time";

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function collectionNamesByGame(collections: Collection[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const c of collections) {
    for (const id of c.game_ids || []) {
      const list = map.get(id) || [];
      list.push(c.name);
      map.set(id, list);
    }
  }
  return map;
}

function rowFields(game: Game, names: string[]) {
  const completed = game.date_completed
    ? new Date(game.date_completed).toISOString().slice(0, 10)
    : "";
  return {
    title: game.title || "",
    status: game.status,
    platform: (game.owned_platforms || []).join("; "),
    playtime: formatPlaytimePrecise(game.playtime),
    rating: game.personal_rating == null ? "" : String(game.personal_rating),
    completion: completed,
    collections: names.join("; "),
  };
}

export function gamesToCsv(games: Game[], collections: Collection[]): string {
  const names = collectionNamesByGame(collections);
  const header = ["title", "status", "platform", "playtime", "rating", "completion_date", "collections"];
  const lines = [header.join(",")];
  for (const game of games) {
    const f = rowFields(game, names.get(game.id) || []);
    lines.push(
      [f.title, f.status, f.platform, f.playtime, f.rating, f.completion, f.collections]
        .map(csvEscape)
        .join(",")
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function gamesToMarkdown(games: Game[], collections: Collection[]): string {
  const names = collectionNamesByGame(collections);
  const lines = [
    "# GameTrack Library",
    "",
    `| Title | Status | Platform | Playtime | Rating | Completed | Collections |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
  ];
  for (const game of games) {
    const f = rowFields(game, names.get(game.id) || []);
    const cells = [f.title, f.status, f.platform, f.playtime, f.rating || "—", f.completion || "—", f.collections || "—"]
      .map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " "));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

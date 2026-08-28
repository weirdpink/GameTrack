export const THEME_IDS = ["noir", "crimson", "paper", "arctic"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeDef {
  id: ThemeId;
  name: string;
  code: string;
  description: string;
  /** Solid <html> background used for the browser chrome theme-color. */
  themeColor: string;
  /** Swatch colors for the settings picker preview. */
  preview: { bg: string; accent: string; border: string };
}

export const THEMES: ThemeDef[] = [
  {
    id: "noir",
    name: "Terminal Noir",
    code: "NOIR",
    description: "Matte black terminal with signal yellow.",
    themeColor: "#0A0A0A",
    preview: { bg: "#0A0A0A", accent: "#FDE047", border: "#27272A" },
  },
  {
    id: "crimson",
    name: "Crimson",
    code: "CRIMSON",
    description: "Deep charcoal red with alert crimson.",
    themeColor: "#0D0606",
    preview: { bg: "#0D0606", accent: "#F87171", border: "#2E1A1A" },
  },
  {
    id: "paper",
    name: "Paper",
    code: "PAPER",
    description: "Warm paper with ink and terracotta.",
    themeColor: "#F4F1EA",
    preview: { bg: "#F4F1EA", accent: "#C2410C", border: "#DCD7C9" },
  },
  {
    id: "arctic",
    name: "Arctic",
    code: "ARCTIC",
    description: "Cool slate with arctic blue.",
    themeColor: "#EEF1F4",
    preview: { bg: "#EEF1F4", accent: "#1D4ED8", border: "#D8DDE3" },
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/**
 * Applies a theme to the document root via the `data-theme` attribute.
 * The actual color values live in CSS (`:root[data-theme="..."]` blocks in
 * index.css); this only flips the selector and syncs the browser chrome.
 */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = id;

  const def = THEMES.find((t) => t.id === id);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (def && meta) meta.setAttribute("content", def.themeColor);
}

let rebootTimer: number | null = null;

/**
 * Reboot-style theme switch with a smooth staged flow:
 *   1. Fade in to a black screen (fast, over the still-visible old theme).
 *   2. Once fully black, swap the theme (data-theme) underneath.
 *   3. Show a status label and hold briefly.
 *   4. Fade the black out to reveal the new theme; the browser chrome
 *      (theme-color) is only synced at reveal time so it never flashes
 *      ahead of the content.
 * The overlay blocks interaction until it lifts.
 */
export function applyThemeWithReboot(id: ThemeId) {
  const overlay = document.getElementById("theme-reboot");
  const root = document.documentElement;
  if (!overlay) {
    applyTheme(id);
    return;
  }

  if (rebootTimer !== null) window.clearTimeout(rebootTimer);

  const def = THEMES.find((t) => t.id === id);
  const label = document.getElementById("theme-reboot-label");
  if (label && def) label.textContent = `APPLYING THEME — ${def.code}`;

  overlay.classList.add("active");
  void overlay.offsetWidth;

  rebootTimer = window.setTimeout(() => {
    root.dataset.theme = id;
    label?.classList.add("show");

    rebootTimer = window.setTimeout(() => {
      if (def) {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", def.themeColor);
      }
      label?.classList.remove("show");
      overlay.classList.remove("active");
      rebootTimer = null;
    }, 750);
  }, 190);
}

/** Consistent platform → color mapping used across GameTrack views */
const PLATFORM_COLORS: Record<string, string> = {
  pc: "bg-blue-500/30 text-blue-400",
  playstation: "bg-indigo-500/30 text-indigo-400",
  xbox: "bg-green-500/30 text-green-400",
  nintendo: "bg-red-500/30 text-red-400",
  ios: "bg-cyan-500/30 text-cyan-400",
  android: "bg-lime-500/30 text-lime-400",
  mac: "bg-gray-500/30 text-gray-400",
  linux: "bg-orange-500/30 text-orange-400",
};

export function getPlatformColor(slug: string): string {
  const lower = slug.toLowerCase();
  for (const [key, classes] of Object.entries(PLATFORM_COLORS)) {
    if (lower.includes(key)) return classes;
  }
  return "bg-zinc-700/40 text-zinc-400";
}

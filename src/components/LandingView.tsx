import React, { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { useGameTrackStore } from "../store";
import {
  Joystick, SquarePlus, Search, BarChart3,
  DatabaseBackup, ArrowRight, ArrowDown, Terminal, Gamepad2,
} from "lucide-react";

function useTypewriter(lines: readonly string[], speed = 14, lineGap = 320, startDelay = 500) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState<{ text: string; done: boolean }[]>(() =>
    reduce ? lines.map((l) => ({ text: l, done: true })) : lines.map(() => ({ text: "", done: false }))
  );

  // Depends on the joined content, not array identity — callers pass inline
  // literals, so identity would restart the typewriter on every re-render.
  const linesKey = lines.join("\n");
  useEffect(() => {
    if (reduce) {
      setTyped(lines.map((l) => ({ text: l, done: true })));
      return;
    }
    let cancelled = false;
    setTyped(lines.map(() => ({ text: "", done: false })));

    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    const typeLine = (li: number) => {
      if (cancelled || li >= lines.length) return;
      const line = lines[li]!;
      let ci = 0;
      const charTimer = setInterval(() => {
        if (cancelled) {
          clearInterval(charTimer);
          return;
        }
        ci++;
        setTyped((prev) => {
          const next = [...prev];
          next[li] = { text: line.slice(0, ci), done: ci >= line.length };
          return next;
        });
        if (ci >= line.length) {
          clearInterval(charTimer);
          timers.push(setTimeout(() => typeLine(li + 1), lineGap));
        }
      }, speed);
      intervals.push(charTimer);
    };

    timers.push(setTimeout(() => typeLine(0), startDelay));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, speed, lineGap, startDelay, reduce]);

  return typed;
}

const gridBg: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
  backgroundSize: "52px 52px",
};

interface TerminalCardProps {
  title: string;
  icon: React.ReactNode;
  lines: string[];
  footer?: string;
}

const TerminalCard = React.memo(function TerminalCard({ title, icon, lines, footer }: TerminalCardProps) {
  const typed = useTypewriter(lines);

  return (
    <div className="border border-brand-border bg-zinc-950/60 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-border bg-zinc-900/60">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[11px] font-mono font-black uppercase tracking-widest text-white">{title}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-brand-border" />
          <span className="w-2 h-2 bg-brand-border" />
          <span className="w-2 h-2 bg-brand-border" />
        </div>
      </div>
      <div className="px-4 py-4 space-y-2 font-mono text-[11px] leading-relaxed min-h-[120px]">
        {typed.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-brand-accent shrink-0">&gt;</span>
            <span className={line.done ? "text-zinc-300" : "text-white"}>{line.text}</span>
            {i === typed.length - 1 && (
              <span className="inline-block w-2 h-3 bg-brand-accent animate-pulse shrink-0" />
            )}
          </div>
        ))}
      </div>
      {footer && (
        <div className="px-4 py-2 border-t border-brand-border">
          <p className="text-[8px] font-mono uppercase tracking-widest text-brand-muted font-bold">{footer}</p>
        </div>
      )}
    </div>
  );
});

export const LandingView: React.FC<{ onEnter: () => void }> = React.memo(({ onEnter }) => {
  const reduce = useReducedMotion();
  const { games, steamSettings, setSettingsOpen, setAuthOpen } = useGameTrackStore();

  const stats = useMemo(() => {
    const library = games;
    const counts: Record<string, number> = {
      backlog: 0, playing: 0, completed: 0, endless: 0,
    };
    let hours = 0;
    for (const g of library) {
      counts[g.status] = (counts[g.status] || 0) + 1;
      if (g.hide_playtime !== 1) hours += g.playtime || 0;
    }
    return {
      total: games.length,
      hours: parseFloat(hours.toFixed(1)),
      completed: counts.completed || 0,
      playing: counts.playing,
      counts,
    };
  }, [games]);

  const genreBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of games) {
      if (!Array.isArray(g.genres)) continue;
      for (const genre of g.genres) map.set(genre, (map.get(genre) || 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([genre, count]) => ({ genre, count }));
  }, [games]);

  const maxGenre = Math.max(1, ...genreBars.map((b) => b.count));

  const scanLines = useMemo(() => {
    const steamLine = steamSettings?.keySet
      ? `steam link — LINKED [${steamSettings.steamName || "OK"}]`
      : "steam link — NOT CONFIGURED";
    return [
      "boot gametrack kernel",
      `load local registry — ${stats.total} entries`,
      steamLine,
      `analytics engine — ${stats.hours}h tracked`,
    ];
  }, [steamSettings, stats]);

  const steamTerminalLines = useMemo(
    () =>
      steamSettings?.keySet
        ? [
            `resolve profile — OK`,
            `fetch owned games — READY`,
            `match igdb metadata — AUTO`,
            `import to registry — ${steamSettings.lastSync ? "LAST SYNC " + new Date(steamSettings.lastSync).toLocaleDateString() : "PENDING"}`,
          ]
        : [
            "resolve profile — OK",
            "fetch owned games — READY",
            "match igdb metadata — AUTO",
            "import to registry — PENDING",
          ],
    [steamSettings]
  );

  const enter = () => {
    onEnter();
  };

  const steamConnected = Boolean(steamSettings?.keySet && steamSettings?.steamId);

  const primaryAction = () => {
    if (steamConnected) enter();
    else setAuthOpen(true);
  };

  const openSettings = () => {
    setSettingsOpen(true);
  };

  const fade: Variants = {
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <div className="w-full bg-brand-bg text-zinc-300 font-sans">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative min-h-[100dvh] flex items-center border-b border-brand-border overflow-hidden">
        <div style={gridBg} className="absolute inset-0 pointer-events-none" />
        <div className="absolute top-[-150px] left-1/4 w-[700px] h-[380px] bg-brand-accent/[0.05] blur-[150px] rounded-full pointer-events-none" />

        <header className="absolute top-0 inset-x-0 z-10">
          <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-6 flex items-center justify-center">
            <div className="flex items-center gap-2.5 select-none">
              <Terminal className="w-5 h-5 text-brand-accent" />
              <span className="text-2xl md:text-3xl font-black tracking-tighter leading-none">
                <span className="text-white">GAME</span>
                <span className="text-brand-accent">TRACK</span>
              </span>
            </div>
          </div>
        </header>

        <div className="relative w-full max-w-[1400px] mx-auto px-6 md:px-12 py-24 pt-32 md:pt-36">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
            <div className="space-y-7">
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2 text-[11px] font-mono font-black uppercase tracking-widest text-brand-muted"
              >
                <span className="w-1.5 h-1.5 bg-brand-accent" />
                // Personal Gaming Registry
              </motion.p>

              <motion.h1
                variants={fade}
                initial={reduce ? false : "hidden"}
                animate="show"
                className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95] text-white"
              >
                YOUR LIBRARY.
                <br />
                <span className="text-brand-accent">ONE REGISTRY.</span>
              </motion.h1>

              <motion.p
                variants={fade}
                initial={reduce ? false : "hidden"}
                animate="show"
                transition={{ delay: 0.15 }}
                className="text-zinc-400 text-base leading-relaxed max-w-[52ch]"
              >
                Import your Steam library automatically, add the rest by hand, and
                watch your playtime analytics.
              </motion.p>

              <motion.div
                variants={fade}
                initial={reduce ? false : "hidden"}
                animate="show"
                transition={{ delay: 0.25 }}
                className="flex flex-col sm:flex-row gap-3 pt-2"
              >
                <button
                  onClick={primaryAction}
                  className="group flex items-center justify-center gap-2.5 px-7 py-3.5 bg-brand-accent hover:bg-brand-accent-hover active:scale-[0.98] text-brand-accent-ink text-xs font-black uppercase tracking-widest rounded-none border border-transparent transition-all cursor-pointer"
                >
                  {steamConnected ? (
                    <>
                      Enter Registry
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  ) : (
                    <>
                      Connect Steam
                      <Joystick className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
                <a
                  href="#link"
                  className="flex items-center justify-center gap-2.5 px-7 py-3.5 bg-transparent hover:bg-zinc-900 text-white text-xs font-black uppercase tracking-widest rounded-none border border-brand-border hover:border-brand-accent/60 transition-all"
                >
                  Scan Features
                  <ArrowDown className="w-4 h-4" />
                </a>
              </motion.div>
            </div>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="hidden lg:block"
            >
              <div className="border border-brand-border bg-zinc-950/60">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-border bg-zinc-900/60">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-brand-accent" />
                    <span className="text-[11px] font-mono font-black uppercase tracking-widest text-white">
                      system-scan // live
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                    <span className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                </div>
                <div className="px-5 py-5 font-mono text-xs leading-relaxed space-y-2.5 min-h-[220px]">
                  {scanLines.map((line, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className="text-brand-accent shrink-0">$</span>
                      <span className="text-zinc-200">{line}</span>
                    </div>
                  ))}
                  <div className="flex gap-2.5">
                    <span className="text-brand-accent shrink-0">$</span>
                    <span className="inline-block w-2 h-3.5 bg-brand-accent animate-pulse" />
                  </div>
                </div>
                <div className="px-5 py-2.5 border-t border-brand-border flex items-center justify-between">
                  <span className="text-[8px] font-mono uppercase tracking-widest text-brand-muted font-bold">
                    Registry: {stats.total} games
                  </span>
                  <span className="text-[8px] font-mono uppercase tracking-widest text-brand-muted font-bold">
                    {stats.hours}h playtime
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── STATUS PIPELINE ───────────────────────────────────── */}
      <section className="border-b border-brand-border bg-zinc-950/40">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-6">
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.35 }}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-widest text-brand-muted"
          >
            <span className="text-brand-accent font-black">Status Pipeline</span>
            {[
              ["BACKLOG", stats.counts.backlog],
              ["PLAYING", stats.counts.playing],
              ["COMPLETED", stats.completed],
              ["ENDLESS", stats.counts.endless],
            ].map(([label, count], i, arr) => (
              <React.Fragment key={label as string}>
                {i > 0 && <span className="text-brand-border">→</span>}
                <span className="flex items-center gap-1.5">
                  {label as string}
                  <span className="text-brand-accent font-black">{count as number}</span>
                </span>
                {i === arr.length - 1 && <span className="text-brand-accent">// LIVE</span>}
              </React.Fragment>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── STEAM / MANUAL ────────────────────────────────────── */}
      <section id="link" className="border-b border-brand-border relative overflow-hidden">
        <div style={gridBg} className="absolute inset-0 pointer-events-none opacity-60" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12 py-24 md:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-14 lg:gap-20 items-center">
            <div className="space-y-6">
              <p className="flex items-center gap-2 text-[11px] font-mono font-black uppercase tracking-widest text-brand-muted">
                <span className="w-1.5 h-1.5 bg-brand-accent" />
                // System Link
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter leading-[1.02] text-white">
                AUTO FROM STEAM.
                <br />
                MANUAL FOR THE REST.
              </h2>
              <p className="text-zinc-400 text-base leading-relaxed max-w-[52ch]">
                Link your Steam account once with a free API key — your owned games import
                automatically with cover art, genres and playtime. Epic, GOG, consoles and
                physical discs have no public library API, so those are added by hand in
                seconds. Search once, it stays yours forever.
              </p>
              <div className="space-y-2.5 pt-1">
                {[
                  "One-time setup under Settings // Steam Link",
                  "Auto-import: titles, posters, genres, playtime",
                  "IGDB metadata enrichment on every match",
                  "Re-sync anytime to pull new purchases",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="w-4 h-4 border border-brand-accent/60 bg-brand-accent/10 flex items-center justify-center shrink-0">
                      <span className="text-brand-accent text-[11px] font-black">✓</span>
                    </span>
                    <span className="text-[11px] font-mono text-zinc-300 uppercase tracking-wider">{item}</span>
                  </div>
                ))}
              </div>
              {steamSettings?.keySet ? (
                <button
                  onClick={openSettings}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 border border-brand-border hover:border-brand-accent/60 text-white text-xs font-black uppercase tracking-widest rounded-none transition-all cursor-pointer"
                >
                  <Joystick className="w-4 h-4 text-brand-accent" />
                  {steamSettings?.steamId
                    ? `Linked: ${steamSettings.steamName || "Steam"}`
                    : "Link profile →"}
                </button>
              ) : (
                <button
                  onClick={() => setAuthOpen(true)}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-brand-accent hover:bg-brand-accent-hover active:scale-[0.98] text-brand-accent-ink text-xs font-black uppercase tracking-widest rounded-none border border-transparent transition-all cursor-pointer"
                >
                  <Joystick className="w-4 h-4" />
                  Connect Steam
                </button>
              )}
            </div>

            <div className="space-y-4">
              <TerminalCard
                title="Steam://Auto-Sync"
                icon={<Joystick className="w-3.5 h-3.5 text-brand-accent" />}
                lines={steamTerminalLines}
                footer="Free API key from steamcommunity.com/dev/apikey"
              />
              <TerminalCard
                title="Others://Manual-Add"
                icon={<SquarePlus className="w-3.5 h-3.5 text-brand-accent" />}
                lines={[
                  "epic / gog / consoles / physical",
                  "search the catalog by title",
                  "add with one click",
                  "no api. full control.",
                ]}
                footer="Every non-Steam game, added in seconds"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES REGISTRY ─────────────────────────────────── */}
      <section id="features" className="border-b border-brand-border">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-24 md:py-32">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter leading-[1.02] text-white max-w-[14ch]">
              BUILT FOR THE LONG RUN.
            </h2>
            <p className="text-zinc-400 text-base leading-relaxed max-w-[40ch]">
              A registry, not a social network. Every feature exists to keep your library honest.
            </p>
          </div>

          <div className="border border-brand-border divide-y divide-brand-border bg-zinc-950/40">
            {/* 01 // DISCOVER */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="group grid grid-cols-1 lg:grid-cols-[56px_1fr_auto] gap-4 lg:items-center px-6 md:px-10 py-8 hover:bg-zinc-900/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <Search className="w-5 h-5 text-brand-accent shrink-0" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-brand-muted group-hover:text-brand-accent transition-colors">01</span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black tracking-tight text-white uppercase">Discover</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-[52ch]">
                  IGDB-powered search across the entire catalog — trending titles, ratings,
                  screenshots, genre tags. Find it, add it, done.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <span className="px-2.5 py-1 border border-brand-border font-mono text-[8px] uppercase tracking-widest text-brand-muted">Trending feed</span>
              </div>
            </motion.div>

            {/* 02 // ANALYTICS */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="group grid grid-cols-1 lg:grid-cols-[56px_1fr_auto] gap-4 lg:items-center px-6 md:px-10 py-8 hover:bg-zinc-900/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <BarChart3 className="w-5 h-5 text-brand-accent shrink-0" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-brand-muted group-hover:text-brand-accent transition-colors">02</span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black tracking-tight text-white uppercase">Analytics</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-[52ch]">
                  Playtime, genres, platforms — month by month. No guessing, no estimates.
                </p>
              </div>
              <div className="w-full lg:w-[220px] space-y-1.5">
                {genreBars.length === 0 && (
                  <p className="font-mono text-[11px] uppercase tracking-widest text-brand-muted text-right">
                    // no data yet
                  </p>
                )}
                {genreBars.map((bar) => (
                  <div key={bar.genre} className="flex items-center gap-2.5">
                    <span className="flex-1 h-1.5 bg-zinc-900 border border-brand-border">
                      <span
                        className="block h-full bg-brand-accent/80"
                        style={{ width: `${(bar.count / maxGenre) * 100}%` }}
                      />
                    </span>
                    <span className="w-14 text-right font-mono text-[8px] uppercase tracking-widest text-brand-muted truncate">{bar.genre}</span>
                    <span className="w-5 text-right font-mono text-[11px] text-brand-accent font-black">{bar.count}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 03 // LOCAL-FIRST */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="group grid grid-cols-1 lg:grid-cols-[56px_1fr_auto] gap-4 lg:items-center px-6 md:px-10 py-8 hover:bg-zinc-900/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <DatabaseBackup className="w-5 h-5 text-brand-accent shrink-0" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-brand-muted group-hover:text-brand-accent transition-colors">03</span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black tracking-tight text-white uppercase">Local-First</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-[52ch]">
                  SQLite on your machine. No cloud, no account, no telemetry. JSON export and
                  import whenever you want a backup.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {["STEAM", "EPIC", "GOG", "PC", "PS5", "XBOX", "SWITCH", "PHYSICAL"].map((p) => (
                  <span key={p} className="px-2.5 py-1 border border-brand-border font-mono text-[8px] uppercase tracking-widest text-brand-muted">
                    {p}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute bottom-[-200px] right-1/4 w-[600px] h-[400px] bg-brand-accent/[0.04] blur-[150px] rounded-full pointer-events-none" />
        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12 py-24 md:py-32 flex flex-col items-start gap-8">
          <p className="flex items-center gap-2 text-[11px] font-mono font-black uppercase tracking-widest text-brand-muted">
            <Gamepad2 className="w-3.5 h-3.5 text-brand-accent" />
            // End of scan
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.98] text-white">
            READY TO TRACK?
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={primaryAction}
              className="group flex items-center justify-center gap-2.5 px-8 py-4 bg-brand-accent hover:bg-brand-accent-hover active:scale-[0.98] text-brand-accent-ink text-xs font-black uppercase tracking-widest rounded-none border border-transparent transition-all cursor-pointer"
            >
              {steamConnected ? (
                <>
                  Enter Registry
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              ) : (
                <>
                  Connect Steam
                  <Joystick className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand-muted">
            Free API key • Local database • Yours forever
          </p>
        </div>
      </section>
    </div>
  );
});

export default LandingView;

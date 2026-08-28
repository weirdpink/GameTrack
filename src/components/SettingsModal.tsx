import React, { useState, useEffect, useRef } from "react";
import { useGameTrackStore } from "../store";
import { motion, AnimatePresence } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y";
import { 
  Upload, Download, Trash2, Loader2, Settings, Joystick, RefreshCw, Link2, Unlink, ExternalLink, X, Check, ChevronDown
} from "lucide-react";
import { THEMES } from "../themes";

export const SettingsModal: React.FC = React.memo(() => {
  const { 
    isSettingsOpen, setSettingsOpen,
    wipeLibrary, showToast, importLibraryJSON, exportLibraryJSON,
    steamSettings, fetchSteamSettings, saveSteamSettings, syncSteamLibrary,
    customizations, updateCustomizations,
    customPlatforms, addCustomPlatform, removeCustomPlatform,
  } = useGameTrackStore();

  const [customTagInput, setCustomTagInput] = useState("");

  const handleAddCustomTag = async () => {
    const ok = await addCustomPlatform(customTagInput);
    if (ok) setCustomTagInput("");
  };

  const [steamProfile, setSteamProfile] = useState("");
  const [connectingSteam, setConnectingSteam] = useState(false);
  const [syncingSteam, setSyncingSteam] = useState(false);
  const [relinkMode, setRelinkMode] = useState(false);

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [importingLibrary, setImportingLibrary] = useState(false);
  const [exportingLibrary, setExportingLibrary] = useState(false);

  const [wipeConfirmInput, setWipeConfirmInput] = useState("");
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  const panelRef = useModalA11y(isSettingsOpen);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isSettingsOpen) {
      fetchSteamSettings();
    }
  }, [isSettingsOpen, fetchSteamSettings]);

  useEffect(() => {
    if (!isSettingsOpen) {
      setRelinkMode(false);
      setSteamProfile("");
      setShowWipeConfirm(false);
      setWipeConfirmInput("");
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen, setSettingsOpen]);

  const processImportFile = async (file: File) => {
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      showToast("Invalid file format. Please upload a valid .json file.", "error");
      return;
    }

    setImportingLibrary(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        await importLibraryJSON(parsed);
      } catch (err: unknown) {
        showToast("Failed to parse JSON file. Ensure it is a valid GameTrack export.", "error");
      } finally {
        setImportingLibrary(false);
        if (libraryInputRef.current) libraryInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleWipeTrigger = async () => {
    if (wipeConfirmInput !== "WIPE") {
      showToast("Please type 'WIPE' to confirm.", "error");
      return;
    }
    const success = await wipeLibrary();
    if (success) {
      setShowWipeConfirm(false);
      setWipeConfirmInput("");
    }
  };

  const handleConnectSteam = async () => {
    if (!steamProfile.trim()) {
      showToast("Steam profile URL is required.", "error");
      return;
    }
    setConnectingSteam(true);
    const ok = await saveSteamSettings(steamProfile.trim());
    setConnectingSteam(false);
    if (ok) {
      setRelinkMode(false);
      fetchSteamSettings();
    }
  };

  const handleSyncSteam = async () => {
    setSyncingSteam(true);
    // No progress toast here — syncSteamLibrary already surfaces a completion
    // or failure toast; stacking both looks like a duplicate.
    const result = await syncSteamLibrary();
    setSyncingSteam(false);
    if (result?.ok) fetchSteamSettings();
  };

  const formatLastSync = (ts: number | null) => {
    if (!ts) return "NEVER";
    return new Date(ts).toLocaleString();
  };

  return (
    <AnimatePresence>
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setSettingsOpen(false)}
            className="absolute inset-0 bg-black/90"
          />

          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            style={{ willChange: "transform" }}
            aria-labelledby="settings-modal-title"
            className="relative w-full max-w-md h-full bg-brand-bg border-l border-brand-border text-white shadow-2xl flex flex-col z-10"
          >
            <div className="flex items-center justify-between border-b border-brand-border p-5 shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-brand-accent stroke-[3]" />
                <h3 id="settings-modal-title" className="text-sm font-mono font-black uppercase tracking-widest text-white">System Settings</h3>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Close (Esc)"
                className="w-[34px] h-[34px] rounded-none bg-zinc-950 border border-brand-border text-brand-muted hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0"
                title="Close Panel (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-7 overscroll-contain">
              
              {/* 1. Steam Identity */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">01 // Steam Identity</h4>
                <div className="bg-zinc-950/40 border border-brand-border p-4.5 space-y-3">
                  {steamSettings?.steamId ? (
                    <>
                      <div className="flex items-center gap-3.5">
                        <div className="shrink-0 w-12 h-12 bg-zinc-900 border border-brand-border flex items-center justify-center overflow-hidden">
                          {steamSettings.avatarUrl ? (
                            <img src={steamSettings.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Joystick className="w-5 h-5 text-brand-accent" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-mono font-black uppercase tracking-widest text-white truncate">
                            {steamSettings.steamName || "Steam account"}
                          </p>
                          <p className="text-[11px] font-mono text-brand-muted uppercase tracking-wider mt-0.5 truncate">
                            ID64 {steamSettings.steamId}
                          </p>
                        </div>
                        <span className="shrink-0 ml-auto w-2 h-2 bg-emerald-500 animate-[pulse_2s_ease-in-out_infinite]" title="Connected" />
                      </div>
                      <a
                        href={steamSettings.profile || `https://steamcommunity.com/profiles/${steamSettings.steamId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-brand-border hover:border-brand-accent/60 text-brand-accent text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Steam Profile
                      </a>
                    </>
                  ) : (
                    <p className="text-[11px] font-mono text-brand-muted uppercase tracking-wider leading-relaxed">
                      // No Steam account linked yet
                    </p>
                  )}
                </div>
              </div>

              {/* 2. Interface Theme */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">02 // Interface Theme</h4>
                <div className="bg-zinc-950/40 border border-brand-border p-4.5 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.map((theme) => {
                      const active = customizations.theme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => updateCustomizations({ theme: theme.id })}
                          aria-pressed={active}
                          className={`group text-left border transition-all cursor-pointer p-2.5 ${
                            active
                              ? "border-brand-accent bg-zinc-900"
                              : "border-brand-border bg-zinc-900/50 hover:border-brand-accent/60"
                          }`}
                        >
                          <div
                            className="w-full h-9 border border-brand-border flex items-end p-1.5"
                            style={{ backgroundColor: theme.preview.bg }}
                          >
                            <span
                              className="block h-2 w-8"
                              style={{ backgroundColor: theme.preview.accent }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-2">
                            <span className={`text-[11px] font-black uppercase tracking-wider truncate ${active ? "text-brand-accent" : "text-white group-hover:text-brand-accent"}`}>
                              {theme.name}
                            </span>
                            {active && <Check className="w-3.5 h-3.5 text-brand-accent shrink-0 stroke-[3]" />}
                          </div>
                          <p className="text-[9px] font-mono uppercase tracking-wider text-brand-muted mt-0.5 truncate">
                            {theme.code} // {theme.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] font-mono text-brand-muted uppercase tracking-wider pt-0.5">
                    // Theme applies instantly and is saved locally
                  </p>
                </div>
              </div>

              {/* 3. Display & Layout */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">03 // Display & Layout</h4>
                <div className="bg-zinc-950/40 border border-brand-border p-4.5 space-y-4">
                  
                  {/* Library Grid Columns */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-mono uppercase tracking-widest text-brand-muted font-bold">
                        Library Grid Columns
                      </label>
                      <span className="text-[11px] font-mono font-bold text-brand-accent">
                        {customizations.libraryColumns} COLS
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[3, 4, 5, 6, 7].map((cols) => (
                        <button
                          key={cols}
                          type="button"
                          onClick={() => updateCustomizations({ libraryColumns: cols })}
                          className={`aspect-square flex items-center justify-center text-xs font-bold uppercase tracking-wider border cursor-pointer transition-all ${
                            customizations.libraryColumns === cols
                              ? "bg-brand-accent text-brand-accent-ink border-brand-accent"
                              : "bg-zinc-900 text-zinc-400 hover:text-white border-brand-border"
                          }`}
                        >
                          {cols}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Discover Grid Columns */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-mono uppercase tracking-widest text-brand-muted font-bold">
                        Discover Grid Columns
                      </label>
                      <span className="text-[11px] font-mono font-bold text-brand-accent">
                        {customizations.discoverColumns} COLS
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[3, 4, 5, 6, 7].map((cols) => (
                        <button
                          key={cols}
                          type="button"
                          onClick={() => updateCustomizations({ discoverColumns: cols })}
                          className={`aspect-square flex items-center justify-center text-xs font-bold uppercase tracking-wider border cursor-pointer transition-all ${
                            customizations.discoverColumns === cols
                              ? "bg-brand-accent text-brand-accent-ink border-brand-accent"
                              : "bg-zinc-900 text-zinc-400 hover:text-white border-brand-border"
                          }`}
                        >
                          {cols}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Badges Toggles */}
                  <div className="pt-2 border-t border-brand-border/40 space-y-2.5">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 group-hover:text-white">
                        Show Playtime Badges
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={customizations.showPlaytimeBadge}
                        aria-label="Toggle playtime badges"
                        onClick={() => updateCustomizations({ showPlaytimeBadge: !customizations.showPlaytimeBadge })}
                        className={`relative w-10 h-5.5 shrink-0 border transition-colors cursor-pointer ${
                          customizations.showPlaytimeBadge
                            ? "bg-brand-accent border-brand-accent"
                            : "bg-zinc-900 border-brand-border"
                        }`}
                      >
                        <span
                          className={`absolute top-1/2 -translate-y-1/2 w-4 h-3.5 transition-all duration-200 ${
                            customizations.showPlaytimeBadge
                              ? "left-[21px] bg-brand-accent-ink"
                              : "left-0.5 bg-brand-muted"
                          }`}
                        />
                      </button>
                    </label>

                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 group-hover:text-white">
                        Show Rating Badges
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={customizations.showRatingBadge}
                        aria-label="Toggle rating badges"
                        onClick={() => updateCustomizations({ showRatingBadge: !customizations.showRatingBadge })}
                        className={`relative w-10 h-5.5 shrink-0 border transition-colors cursor-pointer ${
                          customizations.showRatingBadge
                            ? "bg-brand-accent border-brand-accent"
                            : "bg-zinc-900 border-brand-border"
                        }`}
                      >
                        <span
                          className={`absolute top-1/2 -translate-y-1/2 w-4 h-3.5 transition-all duration-200 ${
                            customizations.showRatingBadge
                              ? "left-[21px] bg-brand-accent-ink"
                              : "left-0.5 bg-brand-muted"
                          }`}
                        />
                      </button>
                    </label>
                  </div>

                </div>
              </div>

              {/* 4. Data Import */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">04 // Data Import</h4>
                <div className="bg-zinc-950/40 border border-brand-border p-4.5 space-y-4">
                  
                  <div className="space-y-2">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-brand-muted font-bold">Library Backup</p>
                    <button
                      type="button"
                      onClick={async () => {
                        setExportingLibrary(true);
                        await exportLibraryJSON();
                        setExportingLibrary(false);
                      }}
                      disabled={exportingLibrary}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-40 disabled:hover:bg-brand-accent text-brand-accent-ink text-xs font-black uppercase tracking-wider rounded-none border border-transparent transition-all cursor-pointer"
                    >
                      {exportingLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Export Library JSON
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-brand-muted font-bold">Library Restore</p>
                    <button
                      type="button"
                      onClick={() => libraryInputRef.current?.click()}
                      disabled={importingLibrary}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-brand-border hover:border-zinc-700 text-white text-xs font-black uppercase tracking-wider rounded-none transition-all cursor-pointer"
                    >
                      {importingLibrary ? <Loader2 className="w-4 h-4 animate-spin text-brand-accent" /> : <Upload className="w-4 h-4 text-brand-accent" />}
                      Import Library JSON
                    </button>
                  </div>

                  <input
                    ref={libraryInputRef}
                    type="file"
                    accept=".json"
                    onChange={(e) => e.target.files && e.target.files[0] && processImportFile(e.target.files[0])}
                    className="hidden"
                  />
                </div>
              </div>

              {/* 5. Custom Platform Tags */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">05 // Custom Platform Tags</h4>
                <div className="bg-zinc-950/40 border border-brand-border p-4.5 space-y-4">
                  <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                    Add your own ownership tags (stores, launchers, retro hardware…) — they appear in every game's platform checklist alongside the built-ins.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      placeholder="e.g. Ubisoft Connect"
                      className="flex-1 min-w-0 bg-zinc-900 border border-brand-border text-white px-3 py-2 text-xs font-mono uppercase tracking-wider placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="shrink-0 px-3.5 py-2 bg-brand-accent hover:bg-brand-accent-hover text-brand-accent-ink text-[11px] font-black uppercase tracking-wider border border-transparent transition-colors cursor-pointer"
                    >
                      Add Tag
                    </button>
                  </div>

                  {customPlatforms.length === 0 ? (
                    <p className="text-[11px] font-mono text-brand-muted uppercase tracking-wider">
                      No custom tags yet — the built-in platforms remain available.
                    </p>
                  ) : (
                    <div className="border border-brand-border divide-y divide-brand-border">
                      {customPlatforms.map((platform) => (
                        <div key={platform.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-900">
                          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-white truncate">{platform.label}</span>
                          <button
                            type="button"
                            onClick={() => removeCustomPlatform(platform.id)}
                            aria-label={`Remove ${platform.label}`}
                            className="shrink-0 w-7 h-7 flex items-center justify-center bg-zinc-950 border border-brand-border text-brand-muted hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Steam Link */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">06 // Steam Link</h4>
                <div className="bg-zinc-950/40 border border-brand-border p-4.5 space-y-4">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-brand-muted font-bold">Library Auto-Sync</p>
                  <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                    Link your Steam account to import your owned games automatically — titles, cover art, genres and playtime. Non-Steam games stay manual.
                  </p>

                  {steamSettings?.keySet && steamSettings?.steamId && !relinkMode ? (
                    <>
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-900 border border-brand-border">
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono text-white uppercase font-black tracking-wider truncate">
                            {steamSettings.steamName || "Steam account"}
                          </p>
                          <p className="text-[8px] font-mono text-brand-muted uppercase tracking-wider mt-0.5 truncate">
                            {steamSettings.profile}
                          </p>
                          <p className="text-[8px] font-mono text-brand-muted uppercase tracking-wider mt-0.5">
                            Last sync: {formatLastSync(steamSettings.lastSync)}
                          </p>
                        </div>
                        <span className="shrink-0 w-2 h-2 bg-emerald-500 animate-[pulse_2s_ease-in-out_infinite]" title="Connected" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRelinkMode(true);
                            setSteamProfile("");
                          }}
                          className="flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-brand-border hover:border-brand-accent/50 text-white text-xs font-black uppercase tracking-wider rounded-none transition-all cursor-pointer"
                        >
                          <Unlink className="w-4 h-4 text-brand-accent" />
                          Re-link
                        </button>
                        <button
                          type="button"
                          onClick={handleSyncSteam}
                          disabled={syncingSteam}
                          className="flex items-center justify-center gap-2 py-2.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-40 disabled:hover:bg-brand-accent text-brand-accent-ink text-xs font-black uppercase tracking-wider rounded-none border border-transparent transition-all cursor-pointer"
                        >
                          {syncingSteam ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {syncingSteam ? "Syncing..." : "Sync Steam"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <label htmlFor="settings-steam-profile" className="block text-[8px] font-mono uppercase tracking-widest text-brand-muted font-bold">Steam Profile URL or ID64</label>
                        <input
                          id="settings-steam-profile"
                          type="text"
                          autoComplete="off"
                          value={steamProfile}
                          onChange={(e) => setSteamProfile(e.target.value)}
                          placeholder="https://steamcommunity.com/id/yourname"
                          className="w-full px-3 py-2 bg-zinc-950 border border-brand-border text-xs font-mono focus:outline-none focus:border-brand-accent text-white"
                        />
                        <p className="text-[8px] font-mono text-brand-muted uppercase tracking-wider pt-0.5">
                          // API key is read from .env on the server
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleConnectSteam}
                          disabled={connectingSteam || syncingSteam}
                          className="flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-brand-border hover:border-brand-accent/50 text-white text-xs font-black uppercase tracking-wider rounded-none transition-all cursor-pointer disabled:opacity-50"
                        >
                          {connectingSteam ? <Loader2 className="w-4 h-4 animate-spin text-brand-accent" /> : <Link2 className="w-4 h-4 text-brand-accent" />}
                          Connect
                        </button>
                        <button
                          type="button"
                          onClick={handleSyncSteam}
                          disabled={!steamSettings?.keySet || syncingSteam || connectingSteam}
                          className="flex items-center justify-center gap-2 py-2.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-40 disabled:hover:bg-brand-accent text-brand-accent-ink text-xs font-black uppercase tracking-wider rounded-none border border-transparent transition-all cursor-pointer"
                        >
                          {syncingSteam ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {syncingSteam ? "Syncing..." : "Sync Steam"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 6. Danger zone */}
              <div className="space-y-3.5">
                <h4 className="text-[11px] font-mono font-black uppercase tracking-widest text-red-500">07 // System Destruct</h4>
                <div className="border border-red-500 bg-red-500/5 p-4.5 space-y-3">
                  <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">Wiping the database deletes all games permanently from the local database.</p>
                  
                  {showWipeConfirm ? (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-mono text-red-400 uppercase font-black">Type WIPE to confirm:</p>
                      <input
                        type="text"
                        value={wipeConfirmInput}
                        onChange={(e) => setWipeConfirmInput(e.target.value)}
                        placeholder="Type WIPE"
                        className="w-full px-3 py-1.5 bg-zinc-950 border border-brand-border text-xs font-mono focus:outline-none focus:border-red-500 text-white"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleWipeTrigger}
                          disabled={wipeConfirmInput !== "WIPE"}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-brand-on-color text-xs font-black uppercase tracking-wider rounded-none cursor-pointer border border-transparent transition-all"
                        >
                          Execute Wipe
                        </button>
                        <button
                          onClick={() => {
                            setShowWipeConfirm(false);
                            setWipeConfirmInput("");
                          }}
                          className="py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-brand-muted text-xs font-black uppercase rounded-none border border-brand-border cursor-pointer transition-all"
                        >
                          Abort
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowWipeConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-zinc-900 hover:bg-red-500/10 hover:text-red-400 text-brand-muted text-xs font-black uppercase tracking-wider border border-brand-border hover:border-red-500/35 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Decommission Database
                    </button>
                  )}
                </div>
              </div>

            </div>

            {canScrollDown && (
              <>
                <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-brand-bg to-transparent pointer-events-none" />
                <div className="absolute -bottom-1.5 inset-x-0 flex justify-center pointer-events-none">
                  <ChevronDown className="w-6 h-6 text-brand-accent" />
                </div>
              </>
            )}

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default SettingsModal;

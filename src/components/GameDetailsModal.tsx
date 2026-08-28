import React, { useState, useEffect, useRef } from "react";
import { useGameTrackStore } from "../store";
import { 
  X, Trash2, Edit2, Trophy, EyeOff, ImageUp
} from "lucide-react";
import { formatPlaytimePrecise } from "../utils/time";
import { motion, AnimatePresence } from "motion/react";
import { uploadPoster } from "../utils/image";
import { useModalA11y } from "../hooks/useModalA11y";
import { STATUSES, getStatusBadgeColor, getStatusLabel, FALLBACK_POSTER_URL, platformIdMatches, mergeCustomPlatforms } from "../constants";
import { PosterImage } from "./PosterImage";
export const GameDetailsModal: React.FC = React.memo(() => {
  const { 
    selectedGame, setSelectedGame, updateGame, deleteGame,
    syncGameSynopsis, syncGamePoster, showToast, customPlatforms,
    games, openPlayingConflict
  } = useGameTrackStore();

  const availablePlatforms = React.useMemo(() => mergeCustomPlatforms(customPlatforms), [customPlatforms]);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [genres, setGenres] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [criticScore, setCriticScore] = useState("");
  const [personalRating, setPersonalRating] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [hidePlaytime, setHidePlaytime] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hours played (edit form)
  const [hoursPlayed, setHoursPlayed] = useState("");
  const [minutesPlayed, setMinutesPlayed] = useState("");
  const [ratingHover, setRatingHover] = useState<number | null>(null);
  const ratingValue = personalRating === "" ? 0 : parseInt(personalRating, 10) || 0;

  // True once the user types in the synopsis textarea; while set, background
  // synopsis refreshes (IGDB auto-sync) must not clobber their in-progress edit.
  const synopsisDirtyRef = useRef(false);

  // Only re-initialize the form when the *selected game changes* (new id),
  // not when the same game's data is refreshed in the store (poster upload,
  // IGDB sync, Steam sync). Otherwise uploading a poster would discard the
  // user's in-progress edits and kick them out of edit mode.
  const lastGameIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedGame) {
      lastGameIdRef.current = null;
      return;
    }
    if (selectedGame.id === lastGameIdRef.current) return;
    lastGameIdRef.current = selectedGame.id;

    setTitle(selectedGame.title);
    setYear(selectedGame.year?.toString() || "");
    setGenres(selectedGame.genres?.join(", ") || "");
    setSynopsis(selectedGame.synopsis);
    synopsisDirtyRef.current = false;
    setPosterUrl(selectedGame.poster_url);
    setCriticScore(selectedGame.critic_score?.toString() || "");
    setHidePlaytime(selectedGame.hide_playtime === 1);
    setPersonalRating(selectedGame.personal_rating?.toString() || "");
    setRatingHover(null);
    // Stored platform values may be aliases ("ps5", "PlayStation 5"...) —
    // canonicalize them to the checkbox ids so toggles match and saving
    // doesn't strip platforms.
    setSelectedPlatforms(
      availablePlatforms
        .map((p) => p.id)
        .filter((pid) => (selectedGame.owned_platforms || []).some((p) => platformIdMatches(pid, p)))
    );
    setIsEditing(false);
    setDeleteConfirm(false);

    // Initialize hours + minutes to represent the current playtime
    const totalPlaytime = selectedGame.playtime || 0;
    const hoursFloor = Math.floor(totalPlaytime);
    const minutesRounding = Math.round((totalPlaytime - hoursFloor) * 60);
    setHoursPlayed((hoursFloor + Math.floor(minutesRounding / 60)).toString());
    setMinutesPlayed((minutesRounding % 60).toString());

    // Automatically sync from IGDB if description is missing
    if (selectedGame.igdb_id && (!selectedGame.synopsis || selectedGame.synopsis === "No synopsis available." || selectedGame.synopsis === "No details provided." || selectedGame.synopsis.trim() === "")) {
      syncGameSynopsis(selectedGame.id, selectedGame.igdb_id);
    }
  }, [selectedGame, syncGameSynopsis]);

  // Mirror background synopsis refreshes (auto IGDB sync, poster uploads) into
  // the local form state so entering edit mode later shows the fresh text —
  // unless the user is mid-edit on the synopsis field.
  useEffect(() => {
    if (synopsisDirtyRef.current) return;
    if (!selectedGame || selectedGame.id !== lastGameIdRef.current) return;
    setSynopsis(selectedGame.synopsis);
  }, [selectedGame?.synopsis, selectedGame?.id]);
  const handlePlatformToggle = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((id) => id !== platformId)
        : [...prev, platformId]
    );
  };

  const handleStatusChange = async (targetStatus: "backlog" | "playing" | "completed" | "endless") => {
    if (!selectedGame || selectedGame.status === targetStatus) return;

    if (targetStatus === "playing") {
      const currentlyPlaying = games.find((g) => g.status === "playing" && g.id !== selectedGame.id);
      if (currentlyPlaying) {
        openPlayingConflict({
          currentGame: currentlyPlaying,
          pendingTitle: selectedGame.title,
          onConfirmSwitch: async (action) => {
            await updateGame(currentlyPlaying.id, {
              status: action === "completed" ? "completed" : "backlog",
              ...(action === "completed" ? { date_completed: Date.now() } : {}),
            });
            await updateGame(selectedGame.id, { status: "playing" });
          },
        });
        return;
      }
    }

    await updateGame(selectedGame.id, {
      status: targetStatus,
      ...(targetStatus === "completed" && !selectedGame.date_completed ? { date_completed: Date.now() } : {}),
    });
  };

  const handleSaveChanges = async () => {
    if (!selectedGame) return;
    if (!title.trim()) {
      showToast("Game title is required", "error");
      return;
    }

    if (year) {
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 1950 || yearNum > 2100) {
        showToast("Release Year must be between 1950 and 2100", "error");
        return;
      }
    }

    if (criticScore) {
      const scoreNum = parseInt(criticScore, 10);
      if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
        showToast("Critic Score must be between 0 and 100", "error");
        return;
      }
    }

    if (personalRating) {
      const ratingNum = parseInt(personalRating, 10);
      if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 10) {
        showToast("Personal Rating must be between 0 and 10", "error");
        return;
      }
    }

    const hoursNum = parseFloat(hoursPlayed || "0");
    const minutesNum = parseFloat(minutesPlayed || "0");
    if (
      isNaN(hoursNum) || !Number.isFinite(hoursNum) || hoursNum < 0 ||
      isNaN(minutesNum) || !Number.isFinite(minutesNum) || minutesNum < 0
    ) {
      showToast("Playtime must be a positive number", "error");
      return;
    }

    const calculatedPlaytime = parseFloat((hoursNum + minutesNum / 60).toFixed(2));
    const genresArray = genres
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    setSaving(true);
    try {
      const success = await updateGame(selectedGame.id, {
        title: title.trim(),
        year: year ? parseInt(year, 10) : null,
        genres: genresArray,
        synopsis: synopsis.trim(),
        critic_score: criticScore ? parseInt(criticScore, 10) : null,
        playtime: calculatedPlaytime,
        personal_rating: personalRating ? parseInt(personalRating, 10) : null,
        owned_platforms: selectedPlatforms,
        hide_playtime: hidePlaytime ? 1 : 0
      });

      if (success) {
        setIsEditing(false);
        synopsisDirtyRef.current = false;
        showToast("Game updated", "success", "All changes saved");
      } else {
        showToast("Failed to save updates", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };


  const handleDelete = async () => {
    if (!selectedGame) return;
    const success = await deleteGame(selectedGame.id);
    if (success) {
      setSelectedGame(null);
    }
    setDeleteConfirm(false);
  };

  // Poster overlay actions — save immediately, independent of edit mode.
  const handleUploadPoster = async (file: File) => {
    if (!selectedGame) return;
    try {
      const url = await uploadPoster(file);
      setPosterUrl(url);
      await updateGame(selectedGame.id, { poster_url: url });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to upload poster", "error");
    }
  };

  const handleRemovePoster = async () => {
    if (!selectedGame) return;
    if (selectedGame.igdb_id) {
      const original = await syncGamePoster(selectedGame.id, selectedGame.igdb_id);
      if (original) {
        setPosterUrl(original);
        return;
      }
    }
    setPosterUrl(FALLBACK_POSTER_URL);
    await updateGame(selectedGame.id, { poster_url: FALLBACK_POSTER_URL });
  };

  // Using imported getStatusBadgeColor from constants

  const modalRef = useModalA11y(Boolean(selectedGame));

  // Set when the user presses inside the panel; a subsequent click landing on
  // the backdrop after a drag-select is then ignored (see handleBackdropClick).
  const dragStartRef = useRef(false);

  useEffect(() => {
    if (!selectedGame) return;
    document.body.style.overflow = "hidden";
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) {
          setIsEditing(false);
        } else {
          handleClose();
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedGame, setSelectedGame, isEditing, showToast]);

  const handleClose = () => {
    setSelectedGame(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (dragStartRef.current) {
        // Text was drag-selected inside the panel and released over the
        // backdrop — treat it as a selection drag, not a close click.
        dragStartRef.current = false;
        return;
      }
      if (isEditing) {
        setIsEditing(false);
      } else {
        handleClose();
      }
    }
  };

  return (
    <AnimatePresence>
      {selectedGame && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) dragStartRef.current = false;
          }}
          className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/90"
        >
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            style={{ willChange: "transform" }}
            aria-labelledby="details-modal-title"
            onMouseDown={() => { dragStartRef.current = true; }}
            className="relative w-full max-w-4xl rounded-none border border-brand-border bg-brand-bg text-white shadow-2xl flex flex-col md:flex-row h-[90vh] md:h-[820px] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
        


        {/* Left Side: Game Image & Actions */}
        <div className="w-full md:w-1/3 bg-zinc-950 p-6 flex flex-col justify-between border-r border-brand-border md:overflow-y-auto overscroll-contain shrink-0">
          <div className="space-y-5">
            <div className="relative w-full aspect-[2/3] shrink-0 group">
              {(selectedGame.status === "completed") && (
                <div className="absolute top-2.5 left-2.5 bg-brand-accent text-zinc-950 p-1.5 z-10 shadow-lg border border-brand-accent">
                  <Trophy className="w-3.5 h-3.5 text-zinc-950 stroke-[2.5]" />
                </div>
              )}
              <PosterImage
                src={posterUrl}
                alt={selectedGame.title}
                className="w-full h-full object-cover rounded-none border border-brand-border bg-zinc-900"
              />

              {/* Poster hover actions — centered overlay, upload/remove custom poster */}
              <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 pointer-events-none">
                <label
                  htmlFor="modal-poster-file"
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-accent-ink text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors pointer-events-auto select-none"
                >
                  <ImageUp className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Custom Poster</span>
                </label>
                {posterUrl && (
                  <button
                    type="button"
                    title="Restore original poster"
                    onClick={handleRemovePoster}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600/90 hover:bg-red-500 text-brand-on-color text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer pointer-events-auto shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                id="modal-poster-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadPoster(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Touch devices: hover-only overlay is unreachable, so show a
                persistent poster action row instead */}
            <div className="hidden gap-2 [@media(hover:none)]:flex">
              <label
                htmlFor="modal-poster-file"
                className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 bg-brand-accent hover:bg-brand-accent-hover text-brand-accent-ink text-[10px] font-black uppercase tracking-widest cursor-pointer select-none"
              >
                <ImageUp className="w-3.5 h-3.5 shrink-0" />
                Custom Poster
              </label>
              {posterUrl && (
                <button
                  type="button"
                  title="Restore original poster"
                  onClick={handleRemovePoster}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600/90 hover:bg-red-500 text-brand-on-color text-[10px] font-black uppercase tracking-widest cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            <div className="space-y-2">
              <h3 id="details-modal-title" className={`text-xl font-black tracking-tight uppercase ${selectedGame.status === "completed" ? "text-brand-accent" : "text-white"}`}>{selectedGame.title}</h3>
              <p className="text-xs text-brand-muted font-mono uppercase font-bold">
                {selectedGame.year ? `${selectedGame.year} // ` : ""}{selectedGame.genres?.slice(0, 2).join(", ")}
              </p>
              
              <div className="flex flex-wrap gap-2 pt-1">
                <span className={`px-2 py-0.5 rounded-none text-[11px] font-black border uppercase tracking-wider ${getStatusBadgeColor(selectedGame.status)}`}>
                  {getStatusLabel(selectedGame.status)}
                </span>
                {selectedGame.critic_score != null && (
                  <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-black bg-zinc-900 border border-brand-border text-brand-accent">
                    CRITIC: {selectedGame.critic_score}
                  </span>
                )}
                {selectedGame.steam_appid && (
                  <a
                    href={`https://store.steampowered.com/app/${selectedGame.steam_appid}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 rounded-none text-[11px] font-mono font-black bg-zinc-900 border border-brand-border text-brand-accent hover:border-brand-accent hover:text-white transition-colors"
                  >
                    STEAM #{selectedGame.steam_appid}
                  </a>
                )}
              </div>
              {selectedGame.owned_platforms && selectedGame.owned_platforms.filter(p => availablePlatforms.some(ap => platformIdMatches(ap.id, p))).length > 0 && (
                <div className="pt-2 border-t border-brand-border/45 mt-3">
                  <p className="text-[11px] font-mono text-brand-muted uppercase font-bold tracking-widest mb-1">Platforms Owned</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGame.owned_platforms.filter(p => availablePlatforms.some(ap => platformIdMatches(ap.id, p))).map(p => {
                      const platLabel = availablePlatforms.find(ap => platformIdMatches(ap.id, p))?.label || p;
                      return (
                        <span key={p} className="px-2.5 py-1 bg-brand-accent text-brand-accent-ink font-black text-[11px] uppercase tracking-wider border border-brand-accent">
                          {platLabel}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Core Actions */}
          <div className="space-y-2 mt-6 pt-4 border-t border-brand-border">
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full h-10 flex items-center justify-center gap-2 px-4 rounded-none bg-zinc-900 hover:bg-red-500/10 hover:text-red-400 text-brand-muted text-xs font-black uppercase tracking-wider border border-brand-border hover:border-red-500/35 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Delete Game
              </button>
            ) : (
              <div className="w-full h-10 flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 h-full bg-red-600 hover:bg-red-500 text-brand-on-color px-3 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer flex items-center justify-center border border-red-600"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  aria-label="Cancel deletion"
                  className="w-10 h-full bg-zinc-900 hover:bg-zinc-800 text-brand-muted hover:text-white border border-brand-border transition-all cursor-pointer flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Tab Details */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Header Controls (Fixed, does not scroll) */}
          <div className="px-6 md:px-8 py-4 border-b border-brand-border/60 shrink-0 bg-brand-bg flex justify-between items-center">
            {isEditing ? (
              <p className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">
                EDIT_METADATA
              </p>
            ) : (
              <p className="text-[11px] font-mono font-black uppercase tracking-widest text-brand-accent">TITLE CONTROL PANEL</p>
            )}
            <div className="flex items-center gap-2.5">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="px-4 h-[34px] bg-brand-accent hover:bg-brand-accent-hover text-brand-accent-ink rounded-none text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving…" : "Apply"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 h-[34px] rounded-none text-xs font-black uppercase tracking-wider border border-brand-border transition-all cursor-pointer shrink-0"
                >
                  <Edit2 className="w-3.5 h-3.5 text-brand-accent" />
                  Edit Metadata
                </button>
              )}
                  <button
                    onClick={() => (isEditing ? setIsEditing(false) : handleClose())}
                    aria-label={isEditing ? "Cancel editing" : "Close (Esc)"}
                    className="w-[34px] h-[34px] rounded-none bg-zinc-950 border border-brand-border text-brand-muted hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className={`flex-1 overflow-y-auto overscroll-contain space-y-6 ${isEditing ? "p-6 md:p-8" : "pt-4 px-6 pb-6 md:px-8 md:pb-8"}`}>
            {isEditing ? (
              <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="edit-game-title" className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">Game Title</label>
                  <input
                    id="edit-game-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950 border border-brand-border rounded-none text-xs font-bold uppercase tracking-wide text-white focus:outline-none focus:border-brand-accent"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-game-year" className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">Release Year</label>
                  <input
                    id="edit-game-year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950 border border-brand-border rounded-none text-xs font-bold uppercase tracking-wide text-white focus:outline-none focus:border-brand-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="edit-game-genres" className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">Genres (comma separated)</label>
                  <input
                    id="edit-game-genres"
                    type="text"
                    value={genres}
                    onChange={(e) => setGenres(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950 border border-brand-border rounded-none text-xs font-bold uppercase tracking-wide text-white focus:outline-none focus:border-brand-accent"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-game-hours" className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">
                    Playtime
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <input
                        id="edit-game-hours"
                        type="number"
                        min="0"
                        step="0.1"
                        value={hoursPlayed}
                        onChange={(e) => setHoursPlayed(e.target.value)}
                        placeholder="Hours"
                        className="w-full pl-4 pr-7 py-2 bg-zinc-950 border border-brand-border rounded-none text-xs font-bold uppercase tracking-wide text-white focus:outline-none focus:border-brand-accent"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-black text-brand-muted pointer-events-none">H</span>
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <input
                        id="edit-game-minutes"
                        type="number"
                        min="0"
                        step="1"
                        value={minutesPlayed}
                        onChange={(e) => setMinutesPlayed(e.target.value)}
                        placeholder="Minutes"
                        className="w-full pl-4 pr-7 py-2 bg-zinc-950 border border-brand-border rounded-none text-xs font-bold uppercase tracking-wide text-white focus:outline-none focus:border-brand-accent"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-black text-brand-muted pointer-events-none">M</span>
                    </div>
                    <button
                      type="button"
                      title={hidePlaytime ? "Show playtime" : "Hide playtime"}
                      onClick={() => setHidePlaytime((prev) => !prev)}
                      className={`w-[34px] h-[34px] shrink-0 rounded-none border flex items-center justify-center transition-colors cursor-pointer ${
                        hidePlaytime
                          ? "bg-brand-accent border-brand-accent text-brand-accent-ink"
                          : "bg-zinc-950 border-brand-border text-brand-muted hover:text-white hover:border-brand-muted"
                      }`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">Personal Rating</label>
                  <span className="flex items-center gap-1.5 text-[11px] font-mono font-black uppercase tracking-widest">
                    <span className={`w-1.5 h-1.5 ${ratingValue > 0 ? "bg-brand-accent" : "bg-zinc-600"}`} />
                    <span className={ratingValue > 0 ? "text-brand-accent" : "text-brand-muted"}>
                      {ratingValue > 0 ? `Rated ${ratingValue}/10` : "Unrated"}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-11 gap-1" role="radiogroup" aria-label="Personal rating">
                  <button
                    type="button"
                    title="Clear rating"
                    aria-label="Clear rating"
                    onClick={() => {
                      setPersonalRating("");
                      setRatingHover(null);
                    }}
                    className={`aspect-square w-full text-[11px] font-mono font-black border transition-colors duration-100 cursor-pointer flex items-center justify-center ${
                      ratingValue > 0
                        ? "bg-zinc-950 border-brand-border text-white hover:border-red-500/60 hover:text-red-400"
                        : "bg-zinc-950 border-brand-border text-brand-muted hover:text-white"
                    }`}
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                    const active = ratingHover !== null ? n <= ratingHover : n <= ratingValue;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={ratingValue === n}
                        onClick={() => setPersonalRating(ratingValue === n ? "" : String(n))}
                        onMouseEnter={() => setRatingHover(n)}
                        onMouseLeave={() => setRatingHover(null)}
                        className={`aspect-square w-full text-[11px] font-mono font-black border transition-colors duration-100 cursor-pointer select-none ${
                          active
                            ? "bg-brand-accent border-brand-accent text-brand-accent-ink"
                            : "bg-zinc-950 border-brand-border text-brand-muted hover:border-brand-accent/60 hover:text-white"
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>

            {/* Owned Platforms checkboxes */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">Platform Tag checklist</label>
                <div className="flex flex-wrap gap-1.5">
                  {availablePlatforms.map((plat) => (
                    <label
                      key={plat.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border text-[11px] font-black uppercase tracking-wider cursor-pointer transition-colors ${
                        selectedPlatforms.includes(plat.id)
                          ? "bg-brand-accent border-brand-accent text-brand-accent-ink"
                          : "bg-zinc-950 border-brand-border text-brand-muted hover:text-white hover:border-zinc-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(plat.id)}
                        onChange={() => handlePlatformToggle(plat.id)}
                        className="sr-only"
                      />
                      <span className={`w-1.5 h-1.5 rounded-none border shrink-0 ${
                        selectedPlatforms.includes(plat.id)
                          ? "bg-brand-accent-ink border-brand-accent-ink"
                          : "border-brand-muted"
                      }`} />
                      {plat.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-game-synopsis" className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">Game Synopsis / Description</label>
                <textarea
                  id="edit-game-synopsis"
                  value={synopsis}
                  onChange={(e) => { setSynopsis(e.target.value); synopsisDirtyRef.current = true; }}
                  rows={8}
                  className="w-full min-h-[220px] px-4 py-3 bg-zinc-950 border border-brand-border rounded-none text-xs sm:text-[13px] font-normal font-sans text-zinc-200 leading-relaxed focus:outline-none focus:border-brand-accent resize-y"
                  placeholder="Enter synopsis or sync from IGDB"
                />
              </div>

            </div>
          ) : (
            <div className="space-y-6">
              <div className="pt-0">
                <div className="text-zinc-300 text-xs sm:text-sm font-sans space-y-3 leading-relaxed pr-2 select-text">
                  {selectedGame.synopsis ? (
                    selectedGame.synopsis.split('\n\n').map((paragraph: string, idx: number) => (
                      <p key={idx}>{paragraph}</p>
                    ))
                  ) : (
                    <p className="text-brand-muted text-xs uppercase font-mono">No description available.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Status + Registry Metrics Footer (Permanently at the bottom when not editing) */}
          {!isEditing && (
            <div className="px-6 py-5 md:px-8 md:py-6 border-t border-brand-border/60 shrink-0 bg-zinc-950/85 backdrop-blur-sm space-y-3">
              {/* Status Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {STATUSES.map((s) => {
                  const active = selectedGame.status === s.value;
                  const activeStyles: Record<string, string> = {
                    backlog: "bg-zinc-700/30 border-zinc-500 text-zinc-200",
                    playing: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400",
                    completed: "bg-brand-accent/20 border-brand-accent/50 text-brand-accent",
                    endless: "bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-400",
                  };
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => handleStatusChange(s.value as "backlog" | "playing" | "completed" | "endless")}
                      className={`h-9 sm:h-10 px-3 rounded-none border text-[11px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center ${
                        active
                          ? activeStyles[s.value]
                          : "bg-zinc-900/60 border-brand-border/50 text-brand-muted hover:text-white hover:border-zinc-600"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Registry Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`bg-zinc-900/60 border p-3.5 flex flex-col justify-between h-[76px] ${selectedGame.hide_playtime === 1 ? "border-dashed border-red-500/25" : "border-brand-border/50"}`}>
                    <p className="text-[8px] sm:text-[11px] font-mono text-brand-muted uppercase font-bold tracking-widest leading-none">Aggregate Hours</p>
                    {selectedGame.hide_playtime === 1 ? (
                      <h5 className="text-sm sm:text-lg font-black text-red-400/80 font-mono mt-2 leading-none uppercase inline-flex items-center gap-1.5 line-through decoration-2 decoration-red-500/40" title="Playtime is hidden — shown only to you">
                        <EyeOff className="w-3.5 h-3.5 shrink-0" />
                        Hidden
                      </h5>
                    ) : (
                      <h5 className="text-sm sm:text-lg font-black text-white font-mono mt-2 leading-none uppercase">
                        {formatPlaytimePrecise(selectedGame.playtime)}
                      </h5>
                    )}
                  </div>
                  
                  <div className="bg-zinc-900/60 border border-brand-border/50 p-3.5 flex flex-col justify-between h-[76px]">
                    <p className="text-[8px] sm:text-[11px] font-mono text-brand-muted uppercase font-bold tracking-widest leading-none">Personal Grade</p>
                    <h5 className="text-sm sm:text-lg font-black text-brand-accent font-mono mt-2 leading-none uppercase">
                      {selectedGame.personal_rating !== null ? `${selectedGame.personal_rating}/10` : "—"}
                    </h5>
                  </div>

                  <div className="bg-zinc-900/60 border border-brand-border/50 p-3.5 flex flex-col justify-between h-[76px]">
                    <p className="text-[8px] sm:text-[11px] font-mono text-brand-muted uppercase font-bold tracking-widest leading-none">Entry Date</p>
                    <h5 className="text-sm sm:text-lg font-black text-white font-mono mt-2 leading-none uppercase">
                      {new Date(selectedGame.date_added).toLocaleDateString()}
                    </h5>
                  </div>
                </div>
            </div>
          )}

        </div>

        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
});
export default GameDetailsModal;

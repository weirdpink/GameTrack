import React, { useEffect } from "react";
import { useGameTrackStore } from "../store";
import { motion, AnimatePresence } from "motion/react";
import { X, Play } from "lucide-react";
import { formatPlaytimePrecise } from "../utils/time";
import { useModalA11y } from "../hooks/useModalA11y";
import { PosterImage } from "./PosterImage";
import { getStatusBadgeColor } from "../constants";
import type { Game } from "../types";

interface ActiveGamesModalProps {
  open: boolean;
  games: Game[];
  onClose: () => void;
}

export const ActiveGamesModal: React.FC<ActiveGamesModalProps> = ({ open, games, onClose }) => {
  const { setSelectedGame } = useGameTrackStore();
  const panelRef = useModalA11y(open);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const handleOpenDetails = (game: Game) => {
    onClose();
    setSelectedGame(game);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/90"
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            style={{ willChange: "transform" }}
            aria-labelledby="active-games-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl rounded-none border border-brand-border bg-brand-bg text-white shadow-2xl flex flex-col max-h-[85vh] my-auto"
          >
            <div className="flex items-center justify-between border-b border-brand-border p-5 shrink-0">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-brand-accent stroke-[3]" />
                <h3 id="active-games-modal-title" className="text-sm font-mono font-black uppercase tracking-widest text-white">
                  Active Games
                  <span className="text-brand-accent ml-2">{games.length}</span>
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close (Esc)"
                title="Close (Esc)"
                className="w-[34px] h-[34px] rounded-none bg-transparent border border-brand-border text-brand-muted hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3">
              {games.length === 0 ? (
                <div className="border border-brand-border border-dashed p-6 text-center">
                  <p className="text-brand-muted text-xs uppercase font-bold font-mono">No games in active play</p>
                </div>
              ) : (
                games.map((game) => (
                  <div
                    key={game.id}
                    onClick={() => handleOpenDetails(game)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenDetails(game);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${game.title}`}
                    className="bg-transparent border border-brand-border rounded-none p-3 hover:border-brand-accent/40 cursor-pointer transition-all flex items-center gap-4 focus:outline-none focus:border-brand-accent"
                  >
                    <div className="w-12 h-[68px] shrink-0 overflow-hidden bg-zinc-950 border border-brand-border/50">
                      <PosterImage src={game.poster_url} alt={game.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="font-bold text-white text-sm truncate uppercase tracking-tight">{game.title}</h5>
                      <p className="text-[11px] text-brand-muted font-mono uppercase font-bold mt-1">
                        {game.year ?? "TBA"} · {game.hide_playtime === 1 ? "—" : formatPlaytimePrecise(game.playtime)}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-none text-[11px] font-black border uppercase tracking-wider shrink-0 ${getStatusBadgeColor(game.status)}`}>
                      Playing
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ActiveGamesModal;

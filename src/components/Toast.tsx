import React from "react";
import { useGameTrackStore } from "../store";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const TYPE_STYLES = {
  success: {
    card: "border-l-brand-accent",
    title: "text-brand-accent",
    iconColor: "text-brand-accent",
    bar: "bg-brand-accent",
    Icon: CheckCircle2,
  },
  error: {
    card: "border-l-red-500",
    title: "text-red-400",
    iconColor: "text-red-400",
    bar: "bg-red-500",
    Icon: AlertCircle,
  },
  info: {
    card: "border-l-white/30",
    title: "text-white",
    iconColor: "text-white/70",
    bar: "bg-white/25",
    Icon: Info,
  },
} as const;

export const Toast: React.FC = () => {
  const toasts = useGameTrackStore((state) => state.toasts);
  const dismissToast = useGameTrackStore((state) => state.dismissToast);
  const pauseToast = useGameTrackStore((state) => state.pauseToast);
  const resumeToast = useGameTrackStore((state) => state.resumeToast);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2.5 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const styles = TYPE_STYLES[toast.type];
          const Icon = styles.Icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32, transition: { duration: 0.16, ease: "easeIn" } }}
              transition={{ type: "spring", stiffness: 480, damping: 34 }}
              onMouseEnter={() => pauseToast(toast.id)}
              onMouseLeave={() => resumeToast(toast.id)}
              role={toast.type === "error" ? "alert" : "status"}
              aria-live={toast.type === "error" ? "assertive" : "polite"}
              className={`pointer-events-auto will-change-transform w-[calc(100vw-3rem)] sm:w-auto sm:min-w-[280px] sm:max-w-[340px] overflow-hidden border border-brand-border border-l-4 bg-zinc-950 shadow-[0_16px_48px_rgba(0,0,0,0.6)] ${styles.card}`}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="shrink-0 w-8 h-8 bg-zinc-900 border border-brand-border flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${styles.iconColor}`} />
                </div>

                <div className="min-w-0 flex-1 pt-0.5 space-y-0.5">
                  <p className={`text-[11px] font-mono font-black uppercase tracking-widest leading-snug ${styles.title}`}>
                    {toast.message}
                  </p>
                  {toast.description && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-brand-muted truncate">
                      {toast.description}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 p-1 -mr-1 text-brand-muted hover:text-white transition-colors bg-transparent border border-transparent hover:border-brand-border"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div
                className="toast-progress"
                style={{ animationDuration: `${toast.duration}ms` }}
                data-type={toast.type}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
export default Toast;

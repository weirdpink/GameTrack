import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility for modal dialogs:
 *  - moves focus into the dialog on open,
 *  - traps Tab/Shift+Tab inside it,
 *  - restores focus to the previously focused element on close.
 * Escape handling stays in each modal (it predates this hook).
 */
export function useModalA11y(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;

    const getFocusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : [];

    // Move focus into the dialog (first focusable, or the panel itself so
    // screen readers land on it).
    const first = getFocusables()[0] ?? panel;
    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusables();
      if (!focusables.length) {
        if (panel) {
          panel.focus();
          e.preventDefault();
        }
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (!firstEl || !lastEl) return;
      const active = document.activeElement;
      const isInside = active !== null && panel?.contains(active);
      if (e.shiftKey && (!isInside || active === firstEl)) {
        lastEl.focus();
        e.preventDefault();
      } else if (!e.shiftKey && (!isInside || active === lastEl)) {
        firstEl.focus();
        e.preventDefault();
      }    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Restore focus to whatever opened the dialog (no-op if it's gone).
      // preventScroll keeps the page from jumping when focus is returned.
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return ref;
}

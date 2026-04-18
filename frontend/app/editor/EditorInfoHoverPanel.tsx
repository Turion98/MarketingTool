"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./editorInfoHoverPanel.module.scss";

export type EditorInfoHoverPanelProps = {
  /** Képernyőolvasó + tooltip jellegű címke az ikonhoz */
  ariaLabel: string;
  children: React.ReactNode;
};

/**
 * Kis infó ikon; hover (vagy az ikon + panel feletti tartás) alatt lebegő panel.
 * A panel abszolút pozíciójú — nem tol el más tartalmat.
 */
export function EditorInfoHoverPanel({
  ariaLabel,
  children,
}: EditorInfoHoverPanelProps) {
  const [open, setOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const handleEnter = useCallback(() => {
    clearLeaveTimer();
    setOpen(true);
  }, [clearLeaveTimer]);

  const handleLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setOpen(false), 100);
  }, [clearLeaveTimer]);

  return (
    <div
      className={styles.root}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        className={styles.iconBtn}
        aria-label={ariaLabel}
        tabIndex={0}
      >
        <svg
          className={styles.iconSvg}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <div className={styles.panel} role="tooltip">
          {children}
        </div>
      ) : null}
    </div>
  );
}

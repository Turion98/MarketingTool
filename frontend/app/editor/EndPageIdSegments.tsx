"use client";

import { useEffect, useRef } from "react";
import s from "./endPageIdSegments.module.scss";

export type EndPageIdSegmentsProps = {
  categories: string[];
  category: string;
  tail: string;
  onCategoryChange: (value: string) => void;
  onTailChange: (value: string) => void;
  /** Fókusz elhagyja a blokkot (nem csak mezők között). */
  onBlurCommit: () => void;
  onEscape?: () => void;
  tailInputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
};

export default function EndPageIdSegments({
  categories,
  category,
  tail,
  onCategoryChange,
  onTailChange,
  onBlurCommit,
  onEscape,
  tailInputRef,
  disabled = false,
}: EndPageIdSegmentsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerTailRef = useRef<HTMLInputElement>(null);
  const tailRef = tailInputRef ?? innerTailRef;

  useEffect(() => {
    if (disabled) return;
    const t = window.setTimeout(() => tailRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- egyszeri fókusz megnyitáskor
  }, []);

  const handleBlur = () => {
    requestAnimationFrame(() => {
      const root = wrapRef.current;
      const ae = document.activeElement;
      if (root && ae instanceof Node && root.contains(ae)) return;
      onBlurCommit();
    });
  };

  return (
    <div
      ref={wrapRef}
      className={s.wrap}
      data-no-card-drag="1"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onEscape?.();
        }
      }}
    >
      <span className={s.prefix} aria-hidden>
        end_
      </span>
      <select
        className={s.select}
        value={category}
        disabled={disabled}
        aria-label="Végoldal kategória szegmens (end_kategoria_ formátum)"
        onChange={(e) => onCategoryChange(e.target.value)}
        onBlur={handleBlur}
      >
        <option value="">— válassz —</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <span className={s.sep} aria-hidden>
        _
      </span>
      <input
        ref={tailRef}
        type="text"
        className={s.tail}
        value={tail}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        placeholder="slug_farok"
        aria-label="Végoldal ID egyedi farok része (a kategória után)"
        onChange={(e) => onTailChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onBlurCommit();
          }
        }}
      />
    </div>
  );
}

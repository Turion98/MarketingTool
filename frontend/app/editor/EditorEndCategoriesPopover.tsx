"use client";

import { useCallback, useMemo, useState } from "react";
import {
  collectEndCategoryKeysFromStory,
  countEndPagesWithCategoryPrefix,
  defaultEndCategoryAccentHex,
  isValidEndCategorySlug,
  mergeStoryMetaEditorEndCategoryColors,
  mergeStoryMetaEditorEndCategorySlugs,
  readEditorEndCategoryColorsFromStory,
  readEditorEndCategorySlugsFromStory,
} from "@/app/lib/editor/endPageIdParts";
import s from "./editorEndCategoriesPopover.module.scss";

type EditorEndCategoriesPopoverProps = {
  draftStory: Record<string, unknown>;
  onStoryChange: (next: Record<string, unknown>) => void;
  onBack: () => void;
};

export default function EditorEndCategoriesPopover({
  draftStory,
  onStoryChange,
  onBack,
}: EditorEndCategoriesPopoverProps) {
  const keys = useMemo(
    () => collectEndCategoryKeysFromStory(draftStory),
    [draftStory]
  );
  const metaSlugSet = useMemo(
    () =>
      new Set(
        readEditorEndCategorySlugsFromStory(draftStory).map((x) => x.trim())
      ),
    [draftStory]
  );
  const metaColors = useMemo(
    () => readEditorEndCategoryColorsFromStory(draftStory),
    [draftStory]
  );

  const [newSlug, setNewSlug] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const addSlug = useCallback(() => {
    const raw = newSlug.trim().toLowerCase();
    setErr(null);
    if (!raw) {
      setErr("Írj be egy rövid azonosítót (slug), például veg vagy promo.");
      return;
    }
    if (!isValidEndCategorySlug(raw)) {
      setErr("A slug csak kisbetű, szám és aláhúzás lehet, és kisbetűvel kell kezdődnie.");
      return;
    }
    const prev = readEditorEndCategorySlugsFromStory(draftStory);
    if (prev.includes(raw) || keys.includes(raw)) {
      setErr("Ez a kategória már fel van véve — válassz másik nevet.");
      return;
    }
    onStoryChange(mergeStoryMetaEditorEndCategorySlugs(draftStory, [...prev, raw]));
    setNewSlug("");
  }, [draftStory, keys, newSlug, onStoryChange]);

  const removeSlug = useCallback(
    (slug: string) => {
      if (countEndPagesWithCategoryPrefix(draftStory, slug) > 0) return;
      const prev = readEditorEndCategorySlugsFromStory(draftStory);
      if (!prev.includes(slug)) return;
      let next = mergeStoryMetaEditorEndCategorySlugs(
        draftStory,
        prev.filter((x) => x !== slug)
      );
      next = mergeStoryMetaEditorEndCategoryColors(next, { [slug]: null });
      onStoryChange(next);
    },
    [draftStory, onStoryChange]
  );

  const setCategoryColor = useCallback(
    (slug: string, hex: string) => {
      onStoryChange(
        mergeStoryMetaEditorEndCategoryColors(draftStory, { [slug]: hex })
      );
    },
    [draftStory, onStoryChange]
  );

  const clearCategoryColor = useCallback(
    (slug: string) => {
      onStoryChange(
        mergeStoryMetaEditorEndCategoryColors(draftStory, { [slug]: null })
      );
    },
    [draftStory, onStoryChange]
  );

  return (
    <div className={s.root}>
      <div className={s.headRow}>
        <button type="button" className={s.backBtn} onClick={onBack}>
          ← Vissza
        </button>
      </div>
      <p className={s.lead}>
        <strong>Mire való?</strong> A végoldalak ID-je <code>end_kategoria_farok</code>{" "}
        formátumot használ. Itt látod a már használt kategóriákat, és felvehetsz új
        előtagokat is. <strong>Szín:</strong> a végkártya törzsének háttere; a fejléc
        továbbra is a rendszer arany/zöld kiemelését használja. <strong>Auto:</strong>{" "}
        a slug alapján automatikus színt adunk, amíg nem írsz felül sajátot.
      </p>
      <ul className={s.list} aria-label="Vég-kategóriák">
        {keys.length === 0 ? (
          <li className={s.empty}>
            Még nincs felvett kategória — hozz létre egyet lent a mezőben és a Hozzáadás
            gombbal.
          </li>
        ) : (
          keys.map((k) => {
            const used = countEndPagesWithCategoryPrefix(draftStory, k) > 0;
            const canRemove = !used && metaSlugSet.has(k);
            const displayHex = metaColors[k] ?? defaultEndCategoryAccentHex(k);
            const hasOverride = Boolean(metaColors[k]);
            return (
              <li key={k} className={s.row}>
                <code className={s.slug}>{k}</code>
                <span className={s.badge}>{used ? "van végoldal" : "nincs lap"}</span>
                <div className={s.rowTail}>
                  <label
                    className={s.colorWrap}
                    title="Végkártya törzsének színe — így csoportosíthatod a záró lapokat"
                  >
                    <span className={s.colorLabel}>szín</span>
                    <input
                      type="color"
                      className={s.colorInput}
                      value={displayHex}
                      onChange={(e) => setCategoryColor(k, e.target.value)}
                    />
                  </label>
                  {hasOverride ? (
                    <button
                      type="button"
                      className={s.colorResetBtn}
                      title="Slug alapú automatikus szín visszaállítása"
                      onClick={() => clearCategoryColor(k)}
                    >
                      Auto
                    </button>
                  ) : null}
                  {canRemove ? (
                    <button
                      type="button"
                      className={s.removeBtn}
                      title="Eltávolítás a meta listából (csak ha nincs hozzá lap)"
                      onClick={() => removeSlug(k)}
                    >
                      Törlés
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
      <div className={s.addRow}>
        <input
          type="text"
          className={s.input}
          value={newSlug}
          placeholder="új_slug"
          aria-label="Új vég-kategória slug beírása"
          onChange={(e) => {
            setNewSlug(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSlug();
            }
          }}
        />
        <button type="button" className={s.addBtn} onClick={addSlug}>
          Hozzáadás
        </button>
      </div>
      {err ? <p className={s.err}>{err}</p> : null}
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { saveStoryDocumentJson } from "@/app/lib/api/stories";
import {
  buildStoryDocumentForFirstSave,
  type NewStoryBootstrapForm,
  validateCtaHttpsUrl,
  validateStartPageId,
  validateStorySlug,
} from "@/app/lib/editor/newStoryBootstrap";
import s from "./editor.module.scss";

export type NewStoryMetaPanelProps = {
  onCreated: (result: { jsonSrc: string; id: string }) => void;
};

export default function NewStoryMetaPanel({ onCreated }: NewStoryMetaPanelProps) {
  const [storySlug, setStorySlug] = useState("");
  const [title, setTitle] = useState("");
  const [startPageId, setStartPageId] = useState("start");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("https://");
  const [logo, setLogo] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [locale, setLocale] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      const errSlug = validateStorySlug(storySlug);
      if (errSlug) {
        setFormError(errSlug);
        return;
      }
      if (!title.trim()) {
        setFormError("Kötelező a megjelenített cím (meta.title).");
        return;
      }
      const errStart = validateStartPageId(startPageId);
      if (errStart) {
        setFormError(errStart);
        return;
      }
      if (!ctaLabel.trim()) {
        setFormError("Kötelező az alapértelmezett CTA felirata.");
        return;
      }
      const errUrl = validateCtaHttpsUrl(ctaUrl);
      if (errUrl) {
        setFormError(errUrl);
        return;
      }

      const form: NewStoryBootstrapForm = {
        storySlug,
        title: title.trim(),
        startPageId: startPageId.trim(),
        ctaLabel: ctaLabel.trim(),
        ctaUrl: ctaUrl.trim(),
        logo: logo.trim() || undefined,
        description: description.trim() || undefined,
        author: author.trim() || undefined,
        coverImage: coverImage.trim() || undefined,
        locale: locale.trim() || undefined,
      };

      const doc = buildStoryDocumentForFirstSave(form);
      setBusy(true);
      try {
        const res = await saveStoryDocumentJson(doc, {
          overwrite: false,
          mode: "strict",
        });
        const id = typeof res.id === "string" ? res.id : form.storySlug.trim();
        let jsonSrc =
          typeof res.jsonSrc === "string" ? res.jsonSrc : `/stories/${id}.json`;
        if (!jsonSrc.startsWith("/")) jsonSrc = `/${jsonSrc}`;
        onCreated({ jsonSrc, id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/409|already exists|foglalt/i.test(msg)) {
          setFormError(
            "Ez a sztori-azonosító már foglalt a szerveren. Válassz másik slugot."
          );
        } else {
          setFormError(msg);
        }
      } finally {
        setBusy(false);
      }
    },
    [
      storySlug,
      title,
      startPageId,
      ctaLabel,
      ctaUrl,
      logo,
      description,
      author,
      coverImage,
      locale,
      onCreated,
    ]
  );

  return (
    <form className={s.bootstrapMetaForm} onSubmit={(e) => void onSubmit(e)}>
      <p className={s.bootstrapMetaLead}>
        Add meg a kötelező mezőket, majd mentsd — a szerveren létrejön az új JSON
        fájl. Ezután szerkesztheted a vászont és az oldalakat.
      </p>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>Kötelező</legend>
        <label className={s.bootstrapMetaLabel}>
          Sztori azonosító (slug, fájlnév)
          <input
            className={s.bootstrapMetaInput}
            value={storySlug}
            onChange={(e) => setStorySlug(e.target.value)}
            placeholder="pl. my_campaign_2026"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Megjelenített cím
          <input
            className={s.bootstrapMetaInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="pl. Interaktív kampány"
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Kezdő oldal ID
          <input
            className={s.bootstrapMetaInput}
            value={startPageId}
            onChange={(e) => setStartPageId(e.target.value)}
            placeholder="start"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Alapértelmezett CTA felirat
          <input
            className={s.bootstrapMetaInput}
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="pl. Nyisd meg a jutalmat"
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Alapértelmezett CTA URL (https)
          <input
            className={s.bootstrapMetaInput}
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://example.com"
            spellCheck={false}
            disabled={busy}
          />
        </label>
      </fieldset>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>Opcionális</legend>
        <label className={s.bootstrapMetaLabel}>
          Logo (útvonal)
          <input
            className={s.bootstrapMetaInput}
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="pl. assets/my_logo.png"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Leírás
          <textarea
            className={s.bootstrapMetaTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Szerző
          <input
            className={s.bootstrapMetaInput}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Borítókép (útvonal)
          <input
            className={s.bootstrapMetaInput}
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="/assets/covers/…"
            disabled={busy}
          />
        </label>
        <label className={s.bootstrapMetaLabel}>
          Locale (pl. hu, en)
          <input
            className={s.bootstrapMetaInput}
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            placeholder="en"
            spellCheck={false}
            disabled={busy}
          />
        </label>
      </fieldset>

      {formError ? (
        <p className={s.bootstrapMetaErr} role="alert">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        className={s.bootstrapMetaSubmit}
        disabled={busy}
      >
        {busy ? "Mentés…" : "Meta mentése és sztori létrehozása"}
      </button>
    </form>
  );
}

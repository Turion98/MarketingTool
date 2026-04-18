"use client";

import { useCallback, useState } from "react";
import { saveStoryDocumentJson, uploadStoryBrandAsset } from "@/app/lib/api/stories";
import {
  buildStoryDocumentForFirstSave,
  defaultStoryMetaFormModel,
  type NewStoryBootstrapForm,
  type StoryMetaFormModel,
  validateMetaFormBasics,
  validateStorySlug,
} from "@/app/lib/editor/newStoryBootstrap";
import { StoryMetaFormFields } from "./StoryMetaForm";
import s from "./editor.module.scss";

export type NewStoryMetaPanelProps = {
  onCreated: (result: { jsonSrc: string; id: string }) => void;
};

export default function NewStoryMetaPanel({ onCreated }: NewStoryMetaPanelProps) {
  const [storySlug, setStorySlug] = useState("");
  const [model, setModel] = useState<StoryMetaFormModel>(() =>
    defaultStoryMetaFormModel()
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const slugErr = validateStorySlug(storySlug);
  const logoUploadDisabledReason =
    slugErr && storySlug.trim()
      ? slugErr
      : !storySlug.trim()
        ? "Logo feltöltés: előbb add meg a projekt azonosítót (slug), hogy tudjuk, melyik mappába kerüljön a fájl."
        : null;

  const onUploadLogo = useCallback(async () => {
    setFormError(null);
    const err = validateStorySlug(storySlug);
    if (err) {
      setFormError(err);
      return;
    }
    if (!logoFile) {
      setFormError("Válassz ki egy képfájlt a gépedről a feltöltéshez.");
      return;
    }
    setLogoUploadBusy(true);
    try {
      const res = await uploadStoryBrandAsset(storySlug.trim(), logoFile);
      setModel((m) => ({ ...m, logoPath: res.path }));
      setLogoFile(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogoUploadBusy(false);
    }
  }, [logoFile, storySlug]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      const errSlug = validateStorySlug(storySlug);
      if (errSlug) {
        setFormError(errSlug);
        return;
      }
      const errMeta = validateMetaFormBasics(model);
      if (errMeta) {
        setFormError(errMeta);
        return;
      }

      const form: NewStoryBootstrapForm = {
        storySlug,
        title: model.title.trim(),
        startPageId: model.startPageId.trim(),
        ctaRows: model.ctaRows,
        endDefaultCta: model.endDefaultCta.trim(),
        description: model.description.trim() || undefined,
        author: model.author.trim() || undefined,
        locale: model.locale.trim() || undefined,
      };

      setBusy(true);
      try {
        let logoPath: string | undefined =
          model.logoPath.trim() || undefined;
        if (logoFile) {
          const res = await uploadStoryBrandAsset(storySlug.trim(), logoFile);
          logoPath = res.path;
          setModel((m) => ({ ...m, logoPath: res.path }));
          setLogoFile(null);
        }
        const doc = buildStoryDocumentForFirstSave({
          ...form,
          logo: logoPath,
        });
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
            "Ez a projekt-azonosító már létezik a szerveren. Válassz másik nevet, vagy nyisd meg a meglévő fájlt szerkesztésre."
          );
        } else {
          setFormError(msg);
        }
      } finally {
        setBusy(false);
      }
    },
    [logoFile, model, onCreated, storySlug]
  );

  return (
    <form className={s.bootstrapMetaForm} onSubmit={(e) => void onSubmit(e)}>
      <p className={s.bootstrapMetaLead}>
        <strong>Első mentés:</strong> töltsd ki a kötelező mezőket, majd kattints a mentésre —
        a szerveren létrejön az új fájl, és megnyílik a teljes szerkesztő. A logót
        feltöltheted előbb külön, vagy a mentés egyben feltölti, ha már kiválasztottál fájlt.
      </p>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>Kötelező azonosítók</legend>
        <label className={s.bootstrapMetaLabel}>
          Projekt azonosító (slug — a fájlnév alapja)
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
      </fieldset>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>Megjelenés és gombok (CTA)</legend>
        <StoryMetaFormFields
          model={model}
          onChange={setModel}
          disabled={busy}
          logoFile={logoFile}
          onLogoFileChange={setLogoFile}
          onUploadLogo={() => void onUploadLogo()}
          logoUploadBusy={logoUploadBusy}
          logoUploadDisabledReason={logoUploadDisabledReason}
        />
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
        {busy ? "Mentés…" : "Meta mentése — új projektfájl a szerveren"}
      </button>
    </form>
  );
}

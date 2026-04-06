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
        ? "A logo feltöltéshez add meg a sztori azonosítót (slug)."
        : null;

  const onUploadLogo = useCallback(async () => {
    setFormError(null);
    const err = validateStorySlug(storySlug);
    if (err) {
      setFormError(err);
      return;
    }
    if (!logoFile) {
      setFormError("Válassz képfájlt a feltöltéshez.");
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
            "Ez a sztori-azonosító már foglalt a szerveren. Válassz másik slugot."
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
        Add meg a kötelező mezőket, majd mentsd — a szerveren létrejön az új JSON
        fájl. A logót feltöltheted előbb, vagy a mentés feltölti, ha van kiválasztott
        fájl.
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
      </fieldset>

      <fieldset className={s.bootstrapMetaFieldset}>
        <legend className={s.bootstrapMetaLegend}>Meta és CTA-k</legend>
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
        {busy ? "Mentés…" : "Meta mentése és sztori létrehozása"}
      </button>
    </form>
  );
}

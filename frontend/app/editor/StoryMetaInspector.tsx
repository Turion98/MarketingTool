"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { uploadStoryBrandAsset } from "@/app/lib/api/stories";
import {
  applyStoryMetaFormModelToDraft,
  draftStoryToMetaFormModel,
  validateMetaFormBasics,
  type StoryMetaFormModel,
} from "@/app/lib/editor/newStoryBootstrap";
import { StoryMetaFormFields } from "./StoryMetaForm";
import s from "./editor.module.scss";
import pi from "./pageInspector.module.scss";
import { EditorInfoHoverPanel } from "./EditorInfoHoverPanel";
import hi from "./editorInfoHoverPanel.module.scss";

function storyIdForAssetUpload(draft: Record<string, unknown>): string {
  const sid = draft.storyId;
  if (typeof sid === "string" && sid.trim()) return sid.trim();
  const meta = draft.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const id = (meta as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return "";
}

export type StoryMetaInspectorProps = {
  draftStory: Record<string, unknown>;
  onStoryChange: (next: Record<string, unknown>) => void;
};

export default function StoryMetaInspector({
  draftStory,
  onStoryChange,
}: StoryMetaInspectorProps) {
  const storyId = useMemo(() => storyIdForAssetUpload(draftStory), [draftStory]);

  const metaSig = useMemo(
    () => JSON.stringify(draftStory.meta ?? {}),
    [draftStory.meta]
  );
  const localeSig = useMemo(
    () =>
      typeof draftStory.locale === "string" ? draftStory.locale : "__no_locale__",
    [draftStory.locale]
  );

  const [model, setModel] = useState<StoryMetaFormModel>(() =>
    draftStoryToMetaFormModel(draftStory)
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);

  useEffect(() => {
    setModel(draftStoryToMetaFormModel(draftStory));
    // meta/locale aláírás változásakor szinkronizálunk; ne minden vázlat-referenciánál (oldal szerkesztés).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftStory csak metaSig/localeSig változáskor érdekes
  }, [metaSig, localeSig]);

  const onUploadLogo = useCallback(async () => {
    setFormError(null);
    if (!storyId) {
      setFormError(
        "Hiányzik a projekt azonosító — add meg a meta űrlapon, vagy nyiss meg egy mentett projektfájlt."
      );
      return;
    }
    if (!logoFile) {
      setFormError("Válassz ki egy képfájlt a gépedről a feltöltéshez.");
      return;
    }
    setLogoUploadBusy(true);
    try {
      const res = await uploadStoryBrandAsset(storyId, logoFile);
      setModel((m) => {
        const next = { ...m, logoPath: res.path };
        onStoryChange(applyStoryMetaFormModelToDraft(draftStory, next));
        return next;
      });
      setLogoFile(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogoUploadBusy(false);
    }
  }, [draftStory, logoFile, onStoryChange, storyId]);

  const onApply = useCallback(() => {
    setFormError(null);
    const err = validateMetaFormBasics(model);
    if (err) {
      setFormError(err);
      return;
    }
    setApplyBusy(true);
    try {
      onStoryChange(applyStoryMetaFormModelToDraft(draftStory, model));
    } finally {
      setApplyBusy(false);
    }
  }, [draftStory, model, onStoryChange]);

  return (
    <div className={pi.details}>
      <div className={pi.summaryRow}>
        <h3 className={pi.summary}>Projekt meta</h3>
      </div>
      <div className={pi.body}>
        <div className={pi.inspectorControlRow}>
          <p className={pi.inspectorHintRowTitle}>
            Projektfájl: <strong>{storyId || "—"}</strong>
          </p>
          <EditorInfoHoverPanel ariaLabel="Projekt meta: mentés és azonosító">
            <div className={hi.section}>
              <p className={hi.sectionBody}>
                A „Meta alkalmazása a vázlatra” gomb a szerkesztőben lévő másolatot frissíti. A
                szerverre a vászon fölötti „Változások mentése” írja ki.
              </p>
            </div>
          </EditorInfoHoverPanel>
        </div>
        <StoryMetaFormFields
          model={model}
          onChange={setModel}
          disabled={applyBusy}
          logoFile={logoFile}
          onLogoFileChange={setLogoFile}
          onUploadLogo={() => void onUploadLogo()}
          logoUploadBusy={logoUploadBusy}
          logoUploadDisabledReason={
            !storyId
              ? "Logo feltöltéshez add meg a projekt azonosítót a meta űrlapon."
              : null
          }
        />
        {formError ? (
          <p className={s.bootstrapMetaErr} role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="button"
          className={s.bootstrapMetaSubmit}
          disabled={applyBusy}
          onClick={onApply}
        >
          {applyBusy ? "Alkalmazás…" : "Meta alkalmazása a vázlatra"}
        </button>
      </div>
    </div>
  );
}

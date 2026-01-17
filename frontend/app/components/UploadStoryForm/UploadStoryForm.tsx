"use client";
import React, { useRef, useState } from "react";
import styles from "./UploadStoryForm.module.scss";
import { uploadStory, validateStoryServer } from "../../lib/api/stories";
import {
  validateStory,
  formatErrors,
  formatWarnings,
} from "../../lib/schema/validator";

type PreviewMeta = {
  id?: string;
  title?: string;
  coverImage?: string;
  description?: string;
};

export default function UploadStoryForm() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [stripLegacy, setStripLegacy] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewMeta | null>(null);

  function handleChooseClick() {
    setOk(null);
    setErr(null);
    setErrors([]);
    setWarnings([]);
    setPreview(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setOk(null);
    setErr(null);
    setErrors([]);
    setWarnings([]);
    setPreview(null);

    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      const res = validateStory(data, "warnOnly", stripLegacy);
      if (!res.ok) {
        setErrors(formatErrors(res.errors));
      }
      setWarnings(formatWarnings(res.warnings));

       // Opcionális: már a választáskor szerver validáció (preflight)
    try {
      await validateStoryServer(f, "warnOnly")
    } catch (sv: any) {
      setErrors((prev) => [...prev, ...(sv?.errors || []).map((x:any)=>`${x.path ? x.path+": " : ""}${x.message}`)]);
    }

      // Preview meta (ha van)
      const meta = (data?.meta ?? {}) as any;
      setPreview({
        id: String(meta?.id ?? ""),
        title: String(meta?.title ?? ""),
        coverImage: meta?.coverImage ?? "",
        description: meta?.description ?? "",
      });
    } catch (e: any) {
      setErr(e?.message || "Érvénytelen JSON");
    }
  }

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setOk(null);
    setErr(null);

    // Biztonság kedvéért feltöltés előtt is validálunk
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = validateStory(data, "warnOnly", stripLegacy);
      if (!res.ok) {
        setErrors(formatErrors(res.errors));
        setWarnings(formatWarnings(res.warnings));
        setBusy(false);
        setErr("A JSON nem felel meg a Core sémának. Javítsd a hibákat.");
        return;
      }
       // Szerver-oldali ellenőrzés (biztonsági háló)
    try {
      await validateStoryServer(file, "warnOnly");

    } catch (sv: any) {
      const svErrors = (sv as any).errors || [];
      setErrors((prev) => [
        ...prev,
        ...svErrors.map((x:any)=>`${x.path ? x.path+": " : ""}${x.message}`),
      ]);
      setBusy(false);
      setErr("Szerver-oldali validációs hiba – javítsd a hibákat.");
      return;
    }    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || "Érvénytelen JSON");
      return;
    }

    try {
      const meta = await uploadStory(file);
      setOk(`Feltöltve: ${meta.title || meta.id}. Az Adventures listában elérhető.`);
      // siker után ürítjük a választást, de a blokk látható marad
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      setErr(e?.message || "Feltöltési hiba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.container} data-busy={busy ? "1" : "0"}>
      <div className={styles.title}>Új story JSON feltöltése</div>

      {/* Beállítások */}
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={stripLegacy}
          onChange={(ev) => setStripLegacy(ev.target.checked)}
          disabled={busy}
        />
        <span>Legacy UX mezők automatikus eltávolítása (layout, globalUI, ux*, x-*)</span>
      </label>

      {/* Rejtett file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className={styles.hiddenInput}
      />

      {/* Gombok */}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnChoose}`}
          onClick={handleChooseClick}
          disabled={busy}
        >
          Choose data
        </button>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnUpload}`}
          onClick={handleUpload}
          disabled={!file || busy}
        >
          {busy ? "Uploading..." : "Upload"}
        </button>
      </div>

      {/* Kiválasztott fájlnév kis keretben */}
      <div
        className={styles.fileBadge}
        title={file?.name || "Nincs kiválasztva fájl"}
        aria-live="polite"
      >
        {file ? file.name : "Nincs kiválasztva fájl"}
      </div>

      {/* Preview */}
      {preview && (
        <div className={styles.preview}>
          {preview.coverImage && (
            <img className={styles.cover} src={preview.coverImage} alt={preview.title || "Cover"} />
          )}
          <div className={styles.meta}>
            <div className={styles.metaTitle}>{preview.title || "(nincs title)"}</div>
            <div className={styles.metaId}>{preview.id || "(nincs id)"}</div>
            {preview.description && <div className={styles.metaDesc}>{preview.description}</div>}
          </div>
        </div>
      )}

      {/* Üzenetek */}
      {ok && <div className={styles.msgOk}>{ok}</div>}
      {err && <div className={styles.msgErr}>{err}</div>}

      {/* Hibalista / warningok */}
      {errors.length > 0 && (
        <div className={styles.errorList}>
          <div className={styles.sectionTitle}>Schema hibák</div>
          <ul>{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className={styles.warnList}>
          <div className={styles.sectionTitle}>Figyelmeztetések</div>
          <ul>{warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      <div className={styles.help}>
        Tipp: a <code>meta</code> blokk legyen benne (id, title, coverImage, description).
      </div>
    </div>
  );
}

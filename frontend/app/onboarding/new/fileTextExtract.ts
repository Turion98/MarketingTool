const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".html", ".htm"]);
const PREVIEW_MAX = 8000;

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (TEXT_EXTENSIONS.has(ext)) {
    const text = await file.text();
    return text.slice(0, PREVIEW_MAX);
  }

  if (ext === ".pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (typeof window !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .join(" ");
      parts.push(pageText);
      if (parts.join("\n").length >= PREVIEW_MAX) break;
    }
    return parts.join("\n").slice(0, PREVIEW_MAX);
  }

  throw new Error(
    "Ez a fájltípus még nem támogatott. Használj .txt, .md, .csv vagy .pdf fájlt.",
  );
}

export function isSupportedUploadFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return [".txt", ".md", ".csv", ".json", ".pdf", ".html", ".htm"].some((ext) =>
    name.endsWith(ext),
  );
}

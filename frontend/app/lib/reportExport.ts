// app/lib/reportExport.ts
export async function exportPdf(storyId: string, range = "last7d", tokenSecret?: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE || "";
  // 1) token
  const tokRes = await fetch(`${base}/api/analytics/export_token?storyId=${encodeURIComponent(storyId)}&range=${encodeURIComponent(range)}${tokenSecret ? `&secret=${encodeURIComponent(tokenSecret)}` : ""}`);
  if (!tokRes.ok) throw new Error("Token request failed");
  const { token } = await tokRes.json();
  // 2) pdf
  const pdfRes = await fetch(`${base}/api/analytics/export?fmt=pdf&token=${encodeURIComponent(token)}`);
  if (!pdfRes.ok) throw new Error("PDF export failed");
  const blob = await pdfRes.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `report_${storyId}_${new Date().toISOString().slice(0,10)}.pdf`;
  a.click(); URL.revokeObjectURL(url);
}

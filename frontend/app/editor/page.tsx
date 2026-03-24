import type { Metadata } from "next";
import EditorShell from "./EditorShell";

export const metadata: Metadata = {
  title: "Szerkesztő | Adventure App",
  description: "Vizuális sztori szerkesztő (hamarosan)",
};

export default function EditorPage() {
  return <EditorShell />;
}

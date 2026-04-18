import type { Metadata } from "next";
import EditorShell from "./EditorShell";

export const metadata: Metadata = {
  title: "Sztori szerkesztő | Adventure App",
  description:
    "Gráf alapú sztori szerkesztő: vászon, előnézet és részletes oldal-beállítások egy helyen.",
};

export default function EditorPage() {
  return <EditorShell />;
}

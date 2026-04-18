import type { Metadata } from "next";
import EditorShell from "./EditorShell";

export const metadata: Metadata = {
  title: "Projekt szerkesztő | Adventure App",
  description:
    "Gráf alapú projekt-szerkesztő: vászon, előnézet és részletes lépés-beállítások egy helyen.",
};

export default function EditorPage() {
  return <EditorShell />;
}

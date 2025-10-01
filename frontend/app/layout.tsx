import "./global.css";
import "@/styles/_typography.scss";
import { GameStateProvider } from "./lib/GameStateContext";
import { StyleProfileProvider } from "./lib/StyleProfileContext"; // ✅ új import
import { Cormorant_Garamond } from "next/font/google";
import PaperEffect from "./components/filters/PaperEffect";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata = {
  title: "Adventure App",
  description: "AI-narratív játék",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cormorant.variable}>
      <body>
        <GameStateProvider>
          <StyleProfileProvider> {/* ✅ Globális stílusprofil */}
            {/* SVG filter + mask betöltése */}
            <PaperEffect />
            {children}
          </StyleProfileProvider>
        </GameStateProvider>
      </body>
    </html>
  );
}

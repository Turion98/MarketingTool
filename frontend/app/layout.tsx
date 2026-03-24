// ==========================================================
// Root layout – Security + Style + Game providers integrálva
// ==========================================================

import "./global.css";
import "@/styles/_typography.scss";
import { GameStateProvider } from "./lib/GameStateContext";
import { StyleProfileProvider } from "./lib/StyleProfileContext";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import PaperEffect from "./components/filters/PaperEffect";
import "@/styles/skins/legacy-default.css";
import "@/styles/skins/legacy-contract-overlay.css";



// Auth: session + tier (free/paid/admin); később IdP
import { AuthProvider } from "./lib/auth/useAuth";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading-present",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "Adventure App",
  description: "AI-narratív játék",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-skin="legacy-default"
      className={`${cormorant.variable} ${plusJakarta.variable}`}
    >
      <body>
        {/* Globális auth (AuthProvider) */}
        <AuthProvider>
          {/* ✅ Játékmenet- és stíluskontextus */}
          <GameStateProvider>
            <StyleProfileProvider>
              {/* ✅ SVG filter + papír textúra */}
              <PaperEffect />
              {children}
            </StyleProfileProvider>
          </GameStateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

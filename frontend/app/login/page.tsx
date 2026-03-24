import { Suspense } from "react";
import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Belépés | Adventure App",
  description: "Belépés a szerkesztőbe",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b0f18",
            color: "#e8ecf4",
          }}
        >
          Betöltés…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

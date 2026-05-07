import { Suspense } from "react";
import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Belépés | Questell",
  description: "Belépés a Questell szerkesztői felületére",
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
            background: "#efe5d4",
            color: "#2a2118",
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

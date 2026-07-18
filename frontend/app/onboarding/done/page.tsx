import { Suspense } from "react";
import OnboardingDoneClient from "./OnboardingDoneClient";

export const metadata = {
  title: "Tudásbázis beküldve",
  description:
    "A support tudásbázis adatai sikeresen megérkeztek. A feldolgozás hamarosan indul.",
};

export default function OnboardingDonePage() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: "center", padding: "80px 24px", opacity: 0.6 }}>
          Betöltés…
        </div>
      }
    >
      <OnboardingDoneClient />
    </Suspense>
  );
}

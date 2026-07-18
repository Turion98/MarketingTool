import BriefForm from "./BriefForm";

export const metadata = {
  title: "Tudásbázis felépítése",
  description:
    "Töltsd ki a 6 lépéses gyors kérdőívet — az adataidból support tudásbázist építünk.",
};

export default function NewOnboardingPage() {
  return <BriefForm />;
}

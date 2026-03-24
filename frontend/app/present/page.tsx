// app/present/page.tsx
"use client";

import React from "react";
import LandingPage from "./PresentLandingPage";

const PresentPage: React.FC = () => {
  const handleRequestQuoteClick = () => {
    // ide tehetsz konkrét actiont – pl. mailto vagy scroll
    window.location.href =
      "mailto:hello@questell.io?subject=Questell%20aj%C3%A1nlatk%C3%A9r%C3%A9s";
  };

  const handleViewDemosClick = () => {
    // A gyökér (/) most a kezdő választó; demó / játék a landing útvonalon van
    window.location.href = "/landing";
  };

  return (
    <LandingPage
      logoSrc="/logo-questell.svg"
      logoAlt="Questell logo"
      onRequestQuoteClick={handleRequestQuoteClick}
      onViewDemosClick={handleViewDemosClick}
    />
  );
};

export default PresentPage;

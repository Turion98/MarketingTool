// app/present/page.tsx
"use client";

import React from "react";
import PresentDecisionLanding from "./PresentDecisionLanding";

const PresentPage: React.FC = () => {
  const handleRequestQuoteClick = () => {
    // ide tehetsz konkrét actiont – pl. mailto vagy scroll
    window.location.href =
      "mailto:hello@questell.io?subject=Questell%20aj%C3%A1nlatk%C3%A9r%C3%A9s";
  };

  const handleViewDemosClick = () => {
    window.location.href = "/demos";
  };

  return (
    <PresentDecisionLanding
      logoSrc="/assets/my_logo.png"
      logoAlt="Questell logo"
      onRequestQuoteClick={handleRequestQuoteClick}
      onViewDemosClick={handleViewDemosClick}
    />
  );
};

export default PresentPage;

// lib/adventures.ts
export type AdventureMeta = {
  id: string;
  title: string;
  slug: string;
  cover: string;
  jsonSrc: string;      // /public alól érhető el
  startPageId: string;  // pl. "ch1_pg1"
  blurb?: string;
};

export const adventures: AdventureMeta[] = [
  {
    id: "erod",
    title: "Erőd",
    slug: "erod",
    cover: "/assets/covers/erod.jpg", // tegyél be egy képet ide vagy cseréld placeholderre
    jsonSrc: "/stories/Erodv2_analytics.json",
    startPageId: "ch1_pg1",
    blurb: "Sötét középkori szökés az erőd mélyéről. Döntések, rúnák, rejtvények."
  }
];

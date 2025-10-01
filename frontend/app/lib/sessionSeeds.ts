// frontend/lib/sessionSeeds.ts

/**
 * Új session seed lista létrehozása.
 * @param count Hány seed-et szeretnél egy játékra generálni.
 * @returns A generált seed lista.
 */
export function createSessionSeeds(count: number) {
  const seeds = Array.from({ length: count }, () =>
    Math.floor(Math.random() * 1_000_000)
  );
  sessionStorage.setItem("sessionSeeds", JSON.stringify(seeds));
  return seeds;
}

/**
 * Meglévő session seed lista lekérése.
 * @returns Seed lista tömbként, vagy üres tömb ha nincs.
 */
export function getSessionSeeds(): number[] {
  const seeds = sessionStorage.getItem("sessionSeeds");
  return seeds ? JSON.parse(seeds) : [];
}

/**
 * Determinisztikus seed visszaadása egy adott pageId-hez.
 * A seed index a pageId hash-e alapján kerül kiválasztásra.
 */
export function getSeedForPage(pageId: string): number | null {
  const seeds = getSessionSeeds();
  if (!seeds.length) return null;
  const h = Array.from(pageId).reduce((acc, ch) => (acc << 5) - acc + ch.charCodeAt(0), 0);
  const idx = Math.abs(h) % seeds.length;
  return seeds[idx];
}

/**
 * Session seed lista törlése (opcionális).
 */
export function clearSessionSeeds() {
  sessionStorage.removeItem("sessionSeeds");
}

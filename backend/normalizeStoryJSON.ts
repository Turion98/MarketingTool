// normalizeStoryJSON.ts
//
// Bemenet: nyers story objektum (pl. forest_demo.json parse-olva)
// Kimenet:
// {
//   story: NormalizedStory;   // validator-kompatibilis
//   fixLog: Array<{ type: string; detail: string }>;
// }
//
// Szabályok:
// - schemaVersion fix "1.2.0"
// - storyId = root.storyId || meta.id
// - locale default "hu" ha nincs
// - meta tisztítás
// - pages objektumból tömbbé
// - nextPageId javítás fallbackgel
// - fragment hivatkozások javítása/takarítása
//
// Nem generál új pageId vagy fragmentId. Nem fordít szöveget.

type RawStory = any;

type FixEntry = {
  type: string;
  detail: string;
};

type PageChoice = {
  label?: string;
  text?: string; // legacy
  nextPageId?: string;
  next?: string; // legacy
  fragmentId?: string;
  unlockFragment?: string;
  [key: string]: any;
};

type Page = {
  id: string;
  text?: string | string[];
  choices?: PageChoice[];
  [key: string]: any;
};

type MetaBlock = {
  id: string;
  title?: string;
  description?: string;
  coverImage?: string;
  startPageId?: string;
  campaignId?: string;
  [key: string]: any;
};

type NormalizedStory = {
  schemaVersion: string;
  storyId: string;
  locale: string;
  meta: MetaBlock;
  pages: Page[];
  fragments?: Record<string, any>;
  [key: string]: any;
};

export function normalizeStoryJSON(input: RawStory) {
  const fixLog: FixEntry[] = [];

  // 1. Klónozzuk hogy ne in-place módosítsuk a hívó objektumot
  const raw: any = JSON.parse(JSON.stringify(input ?? {}));

  // 2. Root mezők előkészítése
  // schemaVersion fix
  const SCHEMA_VERSION = "1.2.0";

  // locale default
  const DEFAULT_LOCALE = raw.locale || "hu";

  // meta blokk kinyerése
  const rawMeta: any = raw.meta || {};
  const cleanMeta: MetaBlock = {
    id: rawMeta.id ?? raw.storyId ?? "UNSET_STORY_ID",
  };

  // engedett opcionális kulcsok
  if (rawMeta.title) cleanMeta.title = rawMeta.title;
  if (rawMeta.description) cleanMeta.description = rawMeta.description;
  if (rawMeta.coverImage) cleanMeta.coverImage = rawMeta.coverImage;
  if (rawMeta.startPageId) cleanMeta.startPageId = rawMeta.startPageId;
  if (rawMeta.campaignId) cleanMeta.campaignId = rawMeta.campaignId;

  // storyId meghatározása
  let storyId: string =
    raw.storyId ||
    rawMeta.id ||
    "UNSET_STORY_ID";

  if (!raw.storyId && !rawMeta.id) {
    fixLog.push({
      type: "storyId.fallback",
      detail: `storyId hiányzott, UNSET_STORY_ID került be`,
    });
  }

  // 3. Pages normalizálás -> tömbbé
  // elfogadjuk ha már tömb
  // ha object map, átkonvertáljuk insertion sorrendben
  let pagesArray: Page[] = [];

  if (Array.isArray(raw.pages)) {
    // már jó
    pagesArray = raw.pages as Page[];
  } else if (raw.pages && typeof raw.pages === "object") {
    // object -> array
    const orderedKeys = Object.keys(raw.pages);
    pagesArray = orderedKeys.map((k) => raw.pages[k]);
    fixLog.push({
      type: "pages.objectToArray",
      detail: `pages objektumból tömbbé alakítva, ${orderedKeys.length} oldal`,
    });
  } else {
    // nincs pages -> üres
    pagesArray = [];
    fixLog.push({
      type: "pages.missing",
      detail: "pages hiányzott, üres tömb lett",
    });
  }

  // 4. Fragment registry összegyűjtése
  // Feltételezzük hogy fragmentek vagy root.fragments alatt vannak
  // vagy raw.fragments, vagy rawMeta.fragments stb. Ha több helyen tartod,
  // innen bővíthető a gyűjtés.
  const fragmentRegistry: Record<string, true> = {};
  if (raw.fragments && typeof raw.fragments === "object") {
    for (const fid of Object.keys(raw.fragments)) {
      fragmentRegistry[fid] = true;
    }
  }
  // Ha később chapter-scope fragmenteket is akarsz, itt lehet tovább bővíteni.

  // helper: normalizeFragmentId
  function normalizeFragmentId(badId: string | undefined | null) {
    if (!badId || typeof badId !== "string") return { fixed: null, changed: false };

    if (fragmentRegistry[badId]) {
      return { fixed: badId, changed: false };
    }

    // javítás: ":" -> "_"
    const alt = badId.replace(/:/g, "_");
    if (alt !== badId && fragmentRegistry[alt]) {
      fixLog.push({
        type: "fragment.fix",
        detail: `fragmentId "${badId}" -> "${alt}"`,
      });
      return { fixed: alt, changed: true };
    }

    // nincs találat
    fixLog.push({
      type: "fragment.drop",
      detail: `fragmentId "${badId}" törölve, nem található`,
    });
    return { fixed: null, changed: true };
  }

  // 5. Choices + nextPageId javítás
  // Gyűjtsük az összes pageId-t az érvényességhez
  const knownPageIds = new Set<string>();
  pagesArray.forEach((p: any) => {
    if (p && typeof p.id === "string") {
      knownPageIds.add(p.id);
    }
  });

  function getNextPageIdFallback(currentIndex: number, requested: string | undefined) {
    if (requested && knownPageIds.has(requested)) {
      // oké
      return requested;
    }
    // fallback = következő oldal index+1
    const fallbackPage = pagesArray[currentIndex + 1];
    if (fallbackPage && typeof fallbackPage.id === "string") {
      if (requested && requested !== fallbackPage.id) {
        fixLog.push({
          type: "next.fix",
          detail: `nextPageId "${requested}" helyett "${fallbackPage.id}"`,
        });
      } else {
        fixLog.push({
          type: "next.inject",
          detail: `hiányzó nextPageId automatikusan "${fallbackPage.id}"`,
        });
      }
      return fallbackPage.id;
    }

    // nincs hova menni, ez end
    if (requested && !knownPageIds.has(requested)) {
      fixLog.push({
        type: "next.drop",
        detail: `érvénytelen nextPageId "${requested}" eldobva, nincs fallback`,
      });
    }
    return undefined;
  }

  // Most végigmegyünk az oldalakon és normalizáljuk őket
  const normalizedPages: Page[] = pagesArray.map((page, pageIdx) => {
    const normPage: Page = { ...page };

    // text normalizálás: ha string, hagyjuk stringként. ha array, hagyjuk array-ként.
    // nem nyúlunk bele.

    // choices normalizálás
    if (Array.isArray(normPage.choices)) {
      normPage.choices = normPage.choices
        .map((choice: PageChoice) => {
          const normChoice: PageChoice = { ...choice };

          // label vs text
          if (!normChoice.label && normChoice.text) {
            normChoice.label = normChoice.text;
            delete normChoice.text;
            fixLog.push({
              type: "choice.label",
              detail: `choice.text -> choice.label átírva`,
            });
          }

          // unify nextPageId
          if (!normChoice.nextPageId && normChoice.next) {
            normChoice.nextPageId = normChoice.next;
            delete normChoice.next;
            fixLog.push({
              type: "choice.nextRename",
              detail: `choice.next -> choice.nextPageId`,
            });
          }

          // javítsd nextPageId fallbackkel
          normChoice.nextPageId = getNextPageIdFallback(
            pageIdx,
            normChoice.nextPageId
          );

          // fragment javítás (fragmentId vagy unlockFragment)
          if (normChoice.fragmentId) {
            const { fixed } = normalizeFragmentId(normChoice.fragmentId);
            if (fixed) {
              normChoice.fragmentId = fixed;
            } else {
              delete normChoice.fragmentId;
            }
          }
          if (normChoice.unlockFragment) {
            const { fixed } = normalizeFragmentId(normChoice.unlockFragment);
            if (fixed) {
              normChoice.unlockFragment = fixed;
            } else {
              delete normChoice.unlockFragment;
            }
          }

          return normChoice;
        })
        // ha egy choice végül nem mutat sehová és teljesen üres maradna akkor is visszatarthatjuk
        .filter((c) => {
          // ha sem label sem nextPageId nincs akkor kuka
          if (!c.label && !c.nextPageId) {
            fixLog.push({
              type: "choice.dropEmpty",
              detail: `choice eltávolítva mert üres lett`,
            });
            return false;
          }
          return true;
        });
    } else {
      // nincs choices => lineáris inject ha van következő oldal
      const fallbackNext = getNextPageIdFallback(pageIdx, undefined);
      if (fallbackNext) {
        normPage.choices = [
          {
            label: "Tovább",
            nextPageId: fallbackNext,
          },
        ];
        fixLog.push({
          type: "choice.injectLinear",
          detail: `oldal "${normPage.id}" kapott auto 'Tovább' choice-ot -> ${fallbackNext}`,
        });
      }
    }

    return normPage;
  });

  // 6. Story összeállítás
  const normalizedStory: NormalizedStory = {
    schemaVersion: SCHEMA_VERSION,
    storyId,
    locale: DEFAULT_LOCALE,
    meta: cleanMeta,
    pages: normalizedPages,
  };

  // ha volt fragments blokk az inputban megtartjuk változtatás nélkül
  if (raw.fragments && typeof raw.fragments === "object") {
    normalizedStory.fragments = raw.fragments;
  }

  return {
    story: normalizedStory,
    fixLog,
  };
}

// normalizeStoryJSON.ts
//
// Bemenet: nyers story objektum (pl. forest_demo.json parse-olva)
// Kimenet:
// {
//   story: NormalizedStory;   // CoreSchema (Draft-07) kompatibilis
//   fixLog: Array<{ type: string; detail: string }>;
// }
//
// Szabályok / cél:
// - schemaVersion fix "1.2.0" (SemVer pattern)
// - storyId = root.storyId || meta.id (fallback)
// - locale default "hu" ha nincs
// - meta tisztítás + meta.title kötelező fallback (CoreSchema: meta.required = ["id","title"])
// - pages objektumból tömbbé + id injektálás kulcsból
// - page.nextPageId -> page.next (CoreSchema: page.next van, nextPageId nincs)
// - choice.nextPageId / choice.next egységesítése (preferált: choice.next)
// - next targetek javítása fallbackgel (következő oldal id)
// - fragment hivatkozások javítása/takarítása
//
// Nem generál új pageId vagy fragmentId önkényesen.
// (Legacy mezőkből próbál visszafejteni: pageId -> id, object kulcs -> id)

type RawStory = any;

type FixEntry = {
  type: string;
  detail: string;
};

type PageChoice = {
  label?: string;
  text?: string; // legacy
  nextPageId?: string; // legacy / schema still allows
  next?: string; // preferred
  fragmentId?: string;
  unlockFragment?: string;
  [key: string]: any;
};

type Page = {
  id: string;
  pageId?: string; // legacy helper
  text?: string | string[];
  next?: string;
  nextPageId?: string; // legacy
  choices?: PageChoice[];
  [key: string]: any;
};

type MetaBlock = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  startPageId?: string;
  campaignId?: string;
  author?: string;
  tags?: string[];
  ctaPresets?: Record<string, any>;
  endDefaultCta?: string;
  logo?: string;
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

  // 1) Deep clone (ne in-place módosítsunk)
  const raw: any = JSON.parse(JSON.stringify(input ?? {}));

  // 2) Root mezők előkészítése
  const SCHEMA_VERSION = "1.2.0";
  const DEFAULT_LOCALE = raw.locale || "hu";

  const rawMeta: any = raw.meta || {};

  // storyId meghatározása
  let storyId: string = raw.storyId || rawMeta.id || "UNSET_STORY_ID";
  if (!raw.storyId && !rawMeta.id) {
    fixLog.push({
      type: "storyId.fallback",
      detail: `storyId hiányzott, UNSET_STORY_ID került be`,
    });
  }

  // meta.id + meta.title (title kötelező a CoreSchema szerint)
  const metaId = rawMeta.id ?? raw.storyId ?? storyId ?? "UNSET_STORY_ID";

  // title fallback sorrend (nem “új title”, csak meglévő mezőkből):
  // meta.title -> root.title -> storyId
  const metaTitle =
    (typeof rawMeta.title === "string" && rawMeta.title.trim()) ||
    (typeof raw.title === "string" && raw.title.trim()) ||
    (typeof storyId === "string" && storyId.trim()) ||
    "Untitled";

  if (!rawMeta.title) {
    fixLog.push({
      type: "meta.title.fallback",
      detail: `meta.title hiányzott, fallback: "${metaTitle}"`,
    });
  }

  const cleanMeta: MetaBlock = {
    id: metaId,
    title: metaTitle,
  };

  // engedett opcionális kulcsok
  if (rawMeta.author) cleanMeta.author = rawMeta.author;
  if (rawMeta.description) cleanMeta.description = rawMeta.description;
  if (rawMeta.coverImage) cleanMeta.coverImage = rawMeta.coverImage;
  if (rawMeta.logo) cleanMeta.logo = rawMeta.logo;
  if (rawMeta.tags) cleanMeta.tags = rawMeta.tags;
  if (rawMeta.ctaPresets) cleanMeta.ctaPresets = rawMeta.ctaPresets;
  if (rawMeta.endDefaultCta) cleanMeta.endDefaultCta = rawMeta.endDefaultCta;
  if (rawMeta.startPageId) cleanMeta.startPageId = rawMeta.startPageId;
  if (rawMeta.campaignId) cleanMeta.campaignId = rawMeta.campaignId;

  // 3) Pages normalizálás -> tömbbé + id injektálás
  let pagesArray: Page[] = [];

  if (Array.isArray(raw.pages)) {
    pagesArray = raw.pages as Page[];
  } else if (raw.pages && typeof raw.pages === "object") {
    const orderedKeys = Object.keys(raw.pages);
    pagesArray = orderedKeys.map((k) => {
      const p = raw.pages[k];
      if (p && typeof p === "object") {
        // id injektálás kulcsból, ha hiányzik (nem generálunk újat)
        if (typeof p.id !== "string" || !p.id) {
          p.id = k;
          fixLog.push({
            type: "page.id.injectFromKey",
            detail: `page.id hiányzott -> kulcsból beállítva: "${k}"`,
          });
        }
      }
      return p;
    });

    fixLog.push({
      type: "pages.objectToArray",
      detail: `pages objektumból tömbbé alakítva, ${orderedKeys.length} oldal`,
    });
  } else {
    pagesArray = [];
    fixLog.push({
      type: "pages.missing",
      detail: "pages hiányzott, üres tömb lett",
    });
  }

  // 4) Fragment registry
  const fragmentRegistry: Record<string, true> = {};
  if (raw.fragments && typeof raw.fragments === "object") {
    for (const fid of Object.keys(raw.fragments)) {
      fragmentRegistry[fid] = true;
    }
  }

  function normalizeFragmentId(badId: string | undefined | null) {
    if (!badId || typeof badId !== "string") return { fixed: null as string | null, changed: false };

    if (fragmentRegistry[badId]) {
      return { fixed: badId, changed: false };
    }

    const alt = badId.replace(/:/g, "_");
    if (alt !== badId && fragmentRegistry[alt]) {
      fixLog.push({
        type: "fragment.fix",
        detail: `fragmentId "${badId}" -> "${alt}"`,
      });
      return { fixed: alt, changed: true };
    }

    fixLog.push({
      type: "fragment.drop",
      detail: `fragmentId "${badId}" törölve, nem található`,
    });
    return { fixed: null, changed: true };
  }

  // 5) knownPageIds + legacy id helyreállítás (pageId -> id)
  const knownPageIds = new Set<string>();
  pagesArray.forEach((p: any, idx: number) => {
    if (!p || typeof p !== "object") return;

    // legacy: page.pageId -> page.id
    if ((typeof p.id !== "string" || !p.id) && typeof p.pageId === "string" && p.pageId) {
      p.id = p.pageId;
      fixLog.push({
        type: "page.id.fromLegacyPageId",
        detail: `page[${idx}].pageId -> id: "${p.id}"`,
      });
      delete p.pageId;
    }

    if (typeof p.id === "string" && p.id) {
      knownPageIds.add(p.id);
    } else {
      // Nem generálunk új id-t, csak logoljuk – de tudnod kell: schema így majd elhasalhat.
      fixLog.push({
        type: "page.id.missing",
        detail: `page[${idx}] id hiányzik (nem lett generálva)`,
      });
    }
  });

  function getNextPageIdFallback(currentIndex: number, requested: string | undefined) {
    if (requested && knownPageIds.has(requested)) {
      return requested;
    }

    const fallbackPage = pagesArray[currentIndex + 1];
    if (fallbackPage && typeof fallbackPage.id === "string") {
      if (requested && requested !== fallbackPage.id) {
        fixLog.push({
          type: "next.fix",
          detail: `next target "${requested}" helyett "${fallbackPage.id}"`,
        });
      } else {
        fixLog.push({
          type: "next.inject",
          detail: `hiányzó/érvénytelen next target automatikusan "${fallbackPage.id}"`,
        });
      }
      return fallbackPage.id;
    }

    if (requested && !knownPageIds.has(requested)) {
      fixLog.push({
        type: "next.drop",
        detail: `érvénytelen next target "${requested}" eldobva, nincs fallback`,
      });
    }
    return undefined;
  }

  // 6) Oldalak normalizálása: page.nextPageId -> page.next, choice next egységesítése next-re
  const normalizedPages: Page[] = pagesArray.map((page: any, pageIdx: number) => {
    const normPage: any = { ...(page ?? {}) };

    // id: ha még mindig hiányzik, itt már csak átengedjük (schema majd jelzi)
    // page.nextPageId -> page.next
    if (!normPage.next && typeof normPage.nextPageId === "string" && normPage.nextPageId) {
      normPage.next = normPage.nextPageId;
      delete normPage.nextPageId;
      fixLog.push({
        type: "page.nextRename",
        detail: `page.nextPageId -> page.next (page="${normPage.id ?? pageIdx}")`,
      });
    }

    // page.next fallback/validálás
    if (typeof normPage.next === "string") {
      const fixed = getNextPageIdFallback(pageIdx, normPage.next);
      if (fixed !== normPage.next) {
        normPage.next = fixed;
      }
      if (!fixed) {
        delete normPage.next;
      }
    }

    // choices normalizálás
    if (Array.isArray(normPage.choices)) {
      normPage.choices = normPage.choices
        .map((choice: PageChoice) => {
          const normChoice: PageChoice = { ...(choice ?? {}) };

          // label vs text
          if (!normChoice.label && normChoice.text) {
            normChoice.label = normChoice.text;
            delete normChoice.text;
            fixLog.push({
              type: "choice.label",
              detail: `choice.text -> choice.label átírva`,
            });
          }

          // unify next: nextPageId -> next
          if (!normChoice.next && typeof normChoice.nextPageId === "string" && normChoice.nextPageId) {
            normChoice.next = normChoice.nextPageId;
            delete normChoice.nextPageId;
            fixLog.push({
              type: "choice.nextRename",
              detail: `choice.nextPageId -> choice.next`,
            });
          }

          // ha legacy next van, hagyjuk meg next-ben (semmit nem kell)
          // javítsd next fallbackkel
          if (typeof normChoice.next === "string") {
            const fixed = getNextPageIdFallback(pageIdx, normChoice.next);
            if (fixed !== normChoice.next) {
              normChoice.next = fixed;
            }
            if (!fixed) {
              delete normChoice.next;
            }
          } else {
            // ha nincs target, próbálunk lineáris fallbacket
            const fixed = getNextPageIdFallback(pageIdx, undefined);
            if (fixed) {
              normChoice.next = fixed;
              fixLog.push({
                type: "choice.nextInject",
                detail: `choice kapott auto next-et -> "${fixed}"`,
              });
            }
          }

          // fragment javítás (fragmentId vagy unlockFragment)
          if (normChoice.fragmentId) {
            const { fixed } = normalizeFragmentId(normChoice.fragmentId);
            if (fixed) normChoice.fragmentId = fixed;
            else delete normChoice.fragmentId;
          }

          if (normChoice.unlockFragment) {
            const { fixed } = normalizeFragmentId(normChoice.unlockFragment);
            if (fixed) normChoice.unlockFragment = fixed;
            else delete normChoice.unlockFragment;
          }

          return normChoice;
        })
        .filter((c: PageChoice) => {
          // ha sem label sem next nincs, kuka
          if (!c.label && !c.next) {
            fixLog.push({
              type: "choice.dropEmpty",
              detail: `choice eltávolítva mert üres lett`,
            });
            return false;
          }
          return true;
        });
    } else {
      // nincs choices => injektáljunk lineáris choice-ot, ha van következő oldal
      const fallbackNext = getNextPageIdFallback(pageIdx, undefined);
      if (fallbackNext) {
        normPage.choices = [
          {
            label: "Tovább",
            next: fallbackNext,
          },
        ];
        fixLog.push({
          type: "choice.injectLinear",
          detail: `oldal "${normPage.id ?? pageIdx}" kapott auto 'Tovább' choice-ot -> ${fallbackNext}`,
        });
      }
    }

    return normPage as Page;
  });

  // 7) startPageId sanity (ha van megadva, de nem létező)
  if (cleanMeta.startPageId && !knownPageIds.has(cleanMeta.startPageId)) {
    fixLog.push({
      type: "meta.startPageId.invalid",
      detail: `meta.startPageId "${cleanMeta.startPageId}" nem található a pages[].id között`,
    });
    // nem írjuk felül automatikusan (nem generálunk), csak logoljuk
  }

  // 8) Story összeállítás
  const normalizedStory: NormalizedStory = {
    schemaVersion: SCHEMA_VERSION,
    storyId,
    locale: DEFAULT_LOCALE,
    meta: cleanMeta,
    pages: normalizedPages,
  };

  // fragments blokk megtartása változtatás nélkül
  if (raw.fragments && typeof raw.fragments === "object") {
    normalizedStory.fragments = raw.fragments;
  }

  // ha volt egyéb top-level extra, azt nem emeljük át automatikusan (szándékosan “clean” output)
  return {
    story: normalizedStory,
    fixLog,
  };
}

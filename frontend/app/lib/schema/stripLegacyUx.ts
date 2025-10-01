// frontend/lib/schema/stripLegacyUx.ts

export type StripOptions = {
  /** Kulcsok eltávolítása bárhol a fában (pl. "layout", "globalUI"). */
  dropKeys?: string[];
  /** Prefixek, amikkel kezdődő kulcsokat dobjunk (pl. "ux", "x-"). */
  dropPrefixes?: string[];
  /** Ha true, üres objektumokat/tömböket is kipucol (nullá nem alakít, csak eltávolít, ha értéktelen). */
  pruneEmpty?: boolean;
};

/**
 * Nem mutál: mély másolaton dolgozik.
 * Csak kulcsokat szed ki; értékeket nem alakít át.
 */
export function stripLegacyUx<T = unknown>(input: T, opts?: StripOptions): T {
  const dropKeys = new Set([...(opts?.dropKeys ?? [])]);
  const dropPrefixes = opts?.dropPrefixes ?? [];
  const pruneEmpty = !!opts?.pruneEmpty;

  function shouldDropKey(key: string): boolean {
    if (dropKeys.has(key)) return true;
    return dropPrefixes.some((p) => key.startsWith(p));
  }

  function walk(node: any): any {
    if (Array.isArray(node)) {
      const arr = node.map(walk).filter((v) => !(pruneEmpty && isEmpty(v)));
      return arr;
    }
    if (node && typeof node === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) {
        if (shouldDropKey(k)) continue;
        const next = walk(v);
        if (pruneEmpty && isEmpty(next)) continue;
        out[k] = next;
      }
      return out;
    }
    return node;
  }

  function isEmpty(v: any): boolean {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    return false;
  }

  // mély klón + walk
  return walk(structuredClone(input));
}

/** Alap beállítás: jelenlegi átmenethez elég. */
export const DEFAULT_STRIP_OPTS: StripOptions = {
  dropKeys: ["layout", "globalUI"],
  dropPrefixes: ["ux", "x-"],
  pruneEmpty: true,
};

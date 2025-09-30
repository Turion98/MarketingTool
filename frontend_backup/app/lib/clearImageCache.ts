// frontend/lib/clearImageCache.ts

/**
 * Törli a localStorage-ban az összes image_ prefixű kulcsot.
 */
export function clearImageCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("image_"))
    .forEach((k) => localStorage.removeItem(k));
}

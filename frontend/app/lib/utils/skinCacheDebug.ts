/**
 * DEV ONLY – Skin cache panic reset
 * Törli:
 * - minden mt:v1:skin:* kulcsot
 * - skinByCampaignId mappinget
 */
export function clearSkinCache() {
  let removed: string[] = [];

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("mt:v1:skin:") || key === "skinByCampaignId") {
      localStorage.removeItem(key);
      removed.push(key);
    }
  }

  console.group("[SkinCache] cleared");
  removed.forEach((k) => console.log("❌", k));
  console.groupEnd();

  return removed.length;
}

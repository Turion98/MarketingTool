/**
 * Fiók szint – devben e-mail alapján (NEXT_PUBLIC_DEV_*), később Stripe / IdP.
 *
 * - free: alap jogkör
 * - paid: fizetős funkciók (canAccessPaidFeatures)
 * - admin: saját teljes hozzáférés + minden paid funkció
 */

export type AccountTier = "free" | "paid" | "admin";

export function parseEmailSet(env: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!env?.trim()) return out;
  for (const part of env.split(",")) {
    const e = part.trim().toLowerCase();
    if (e) out.add(e);
  }
  return out;
}

export function resolveTierFromEmail(email: string): AccountTier {
  const n = email.trim().toLowerCase();
  const admins = parseEmailSet(process.env.NEXT_PUBLIC_DEV_ADMIN_EMAILS);
  const paid = parseEmailSet(process.env.NEXT_PUBLIC_DEV_PAID_EMAILS);
  if (admins.has(n)) return "admin";
  if (paid.has(n)) return "paid";
  return "free";
}

export function tierLabelHu(tier: AccountTier): string {
  switch (tier) {
    case "admin":
      return "Admin";
    case "paid":
      return "Fizetős";
    case "free":
    default:
      return "Ingyenes";
  }
}

export function canAccessPaidFeatures(tier: AccountTier): boolean {
  return tier === "paid" || tier === "admin";
}

export function isAdminTier(tier: AccountTier): boolean {
  return tier === "admin";
}

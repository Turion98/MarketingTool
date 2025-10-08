import { CtaConfig, CtaContext } from "./ctaTypes";
import { trackUiClick } from "../../lib/analytics";

function isExternal(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

function triggerDownload(url: string, filename?: string, rel?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename === true as any) a.setAttribute("download", "");
  else if (typeof filename === "string") a.setAttribute("download", filename);
  if (rel) a.setAttribute("rel", rel);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function registerCustomCta(
  id: string,
  fn: (cfg: CtaConfig, ctx: CtaContext) => Promise<void> | void
) {
  customRegistry[id] = fn;
}

// bővíthető registry custom CTA-hoz:
const customRegistry: Record<string, (cfg: CtaConfig, ctx: CtaContext) => Promise<void> | void> = {};

export async function dispatchCta(cfg: CtaConfig, ctx: CtaContext) {
  try {
    // alap analitika – opcionális
    try {
      trackUiClick(
        ctx.campaignId ?? "unknown_campaign",
        ctx.sessionId ?? "sess_unknown",
        ctx.nodeId ?? "unknown_node",
        `cta:${(cfg as any).presetKey ?? cfg.kind}`,
        { kind: cfg.kind }
      );
    } catch {}

    switch (cfg.kind) {
      case "link": {
        const url = (cfg as any).urlTemplate as string;
        const explicitTarget = (cfg as any).target as string | undefined;

        // Dispatcherben konzervatív default: ha nincs target,
        // belsőnél _self, külsőnél _blank (mint a gombban).
        const target = explicitTarget ?? (isExternal(url) ? "_blank" : "_self");

        window.open(url, target);
        return;
      }

      case "download": {
        const url = (cfg as any).urlTemplate as string;
        const filename = (cfg as any).filename as string | undefined;
        const rel = (cfg as any).rel as string | undefined;
        triggerDownload(url, filename, rel);
        return;
      }

      case "restart": {
        // ide jöhet a restart logika, ha van
        // pl.: window.location.reload();
        window.location.reload();
        return;
      }

      default: {
        // custom CTA-k
        const id = (cfg as any).id || (cfg as any).presetKey || cfg.kind;
        const fn = customRegistry[id];
        if (fn) {
          await fn(cfg, ctx);
          return;
        }
        console.warn("[CTA] Unknown kind and no custom handler:", cfg);
        return;
      }
    }
  } catch (err) {
    console.error("[CTA] dispatch error:", err);
  }
}

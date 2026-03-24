import type { CtaConfig, CtaContext } from "./ctaTypes";
import { trackUiClick } from "../../lib/analytics";

function isExternal(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

function triggerDownload(url: string, filename?: string | true, rel?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename === true) a.setAttribute("download", "");
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
        `cta:${cfg.presetKey ?? cfg.kind}`,
        { kind: cfg.kind }
      );
    } catch {}

    switch (cfg.kind) {
      case "link": {
        // Dispatcherben konzervatív default: ha nincs target,
        // belsőnél _self, külsőnél _blank (mint a gombban).
        const target = cfg.target ?? (isExternal(cfg.urlTemplate) ? "_blank" : "_self");

        window.open(cfg.urlTemplate, target);
        return;
      }

      case "download": {
        triggerDownload(cfg.urlTemplate, cfg.filename, cfg.rel);
        return;
      }

      case "restart": {
        // ide jöhet a restart logika, ha van
        // pl.: window.location.reload();
        window.location.reload();
        return;
      }

      case "custom": {
        const id = cfg.actionId || cfg.id || cfg.presetKey || cfg.kind;
        const fn = customRegistry[id];
        if (fn) {
          await fn(cfg, ctx);
          return;
        }
        console.warn("[CTA] Unknown kind and no custom handler:", cfg);
        return;
      }

      default:
        console.warn("[CTA] Unsupported CTA kind in dispatcher:", cfg);
        return;
    }
  } catch (err) {
    console.error("[CTA] dispatch error:", err);
  }
}

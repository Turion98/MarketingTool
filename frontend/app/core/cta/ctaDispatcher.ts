import { CtaConfig, CtaContext } from "./ctaTypes";
import { trackUiClick } from "../../lib/analytics"; // meglévő analitika hívód

// bővíthető registry custom CTA-hoz:
const customRegistry: Record<string, (cfg: CtaConfig, ctx: CtaContext) => Promise<void> | void> = {};

export function registerCustomCta(
  id: string,
  fn: (cfg: CtaConfig, ctx: CtaContext) => Promise<void> | void
) {
  customRegistry[id] = fn;
}

// belső analitika wrapper – egységesítve a CTA eseményekhez
function track(name: string, ctx: CtaContext, meta: Record<string, any> = {}) {
  try {
    const campaignId = ctx.campaignId ?? "unknown_campaign";
    const sessionId  = ctx.sessionId  ?? "unknown_session";
    const pageId     = ctx.nodeId     ?? "unknown_node";
    trackUiClick(
      campaignId,
      sessionId,
      pageId,
      name,                          // pl. "cta_click" | "cta_result"
      meta
    );
  } catch {
    // swallow – analitika hiba ne törje a CTA-t
  }
}

export async function dispatchCta(cfg: CtaConfig, ctx: CtaContext): Promise<void> {
  // kattintás log
  track("cta_click", ctx, {
    kind: cfg.kind,
    presetKey: (cfg as any).presetKey ?? null,
    label: (cfg as any).label ?? null,
  });

  try {
    switch (cfg.kind) {
      case "link": {
        const url = (cfg as any).urlTemplate as string;
        const target = (cfg as any).target ?? "_top";
        if (typeof window !== "undefined" && typeof window.open === "function") {
          const w = window.open(url, target);
          // biztonság kedvéért noopener/noreferrer (target=_blank esetén)
          if (w && target === "_blank") {
            try { (w as any).opener = null; } catch {}
          }
        }
        return;
      }

      case "download": {
        const url = (cfg as any).urlTemplate as string;
        const filename = (cfg as any).filename ?? "";
        if (typeof document !== "undefined") {
          const a = document.createElement("a");
          a.href = url;
          if (filename) a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        return;
      }

      case "webhook": {
        const endpoint = (cfg as any).endpoint as string;
        const method = String((cfg as any).method ?? "POST").toUpperCase();
        const payload = (cfg as any).payloadTemplate ?? {};
        const started = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "POST" || method === "PUT" || method === "PATCH"
            ? JSON.stringify(payload)
            : undefined
        });

        const ended = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        track("cta_result", ctx, {
          status: res.status,
          ok: res.ok,
          latencyMs: Math.round(ended - started),
        });
        return;
      }

      case "share": {
        const text = (cfg as any).textTemplate ?? "";
        const url = (cfg as any).urlTemplate ?? (typeof location !== "undefined" ? location.href : "");
        if (typeof navigator !== "undefined" && (navigator as any).share) {
          await (navigator as any).share({ text, url });
        } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          // opcionális UX: toast/alert
          try { alert("Link copied to clipboard"); } catch {}
        }
        return;
      }

      case "restart": {
        // engine reset / routing – projekted szerint
        if (typeof window !== "undefined") {
          window.location.reload();
        }
        return;
      }

      case "custom": {
        const id = (cfg as any).actionId as string;
        const fn = customRegistry[id];
        if (fn) {
          await fn(cfg, ctx);
        } else {
          console.warn("Unknown custom CTA:", id);
        }
        return;
      }
    }
  } catch (e: any) {
    track("cta_result", ctx, {
      status: "error",
      errorMessage: String(e?.message ?? e),
    });
  }
}

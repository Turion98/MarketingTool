/**
 * Adventure embed loader — iframe + auto height (postMessage).
 * Protokoll: szinkronban kell lennie app/lib/embedParentMessaging.ts literáljaival.
 *
 * Használat (ne tegyél async-t a scriptre, hogy a currentScript biztos legyen):
 * <script src="https://YOUR_ORIGIN/embed.js" data-campaign="slug" data-src="..." data-start="start"></script>
 *
 * Opcionális: data-mode="ghost" → ghost=1 query; data-skin, data-title, data-c, data-runes, data-runemode, data-analytics
 */
(function () {
  var MSG_SOURCE = "adventure-embed";
  var MSG_VERSION = 1;

  function getScriptEl() {
    var sc = document.currentScript;
    if (sc) return sc;
    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1] || null;
  }

  function attr(el, name, fallback) {
    if (!el) return fallback;
    var v = el.getAttribute(name);
    return v != null && String(v).trim() !== "" ? String(v).trim() : fallback;
  }

  var scriptEl = getScriptEl();
  if (!scriptEl || !scriptEl.parentNode) return;

  var srcUrl = scriptEl.src;
  var playerOrigin = "";
  try {
    playerOrigin = new URL(srcUrl).origin;
  } catch (e) {
    return;
  }

  var campaign = attr(scriptEl, "data-campaign", "");
  if (!campaign) {
    console.warn("[embed.js] data-campaign kötelező");
    return;
  }

  var mode = (attr(scriptEl, "data-mode", "standard") || "standard").toLowerCase();
  var isGhost = mode === "ghost";

  var path = "/embed/" + encodeURIComponent(campaign);
  var iframeUrl;
  try {
    iframeUrl = new URL(path, playerOrigin);
  } catch (e2) {
    return;
  }

  function setQP(key, dataAttr, fallback) {
    var v = attr(scriptEl, dataAttr, fallback);
    if (v) iframeUrl.searchParams.set(key, v);
  }

  setQP("src", "data-src", "");
  setQP("start", "data-start", "");
  setQP("title", "data-title", "");
  setQP("skin", "data-skin", "");
  setQP("c", "data-c", "");
  setQP("runes", "data-runes", "");
  setQP("runemode", "data-runemode", "");
  if (attr(scriptEl, "data-analytics", "") === "1") {
    iframeUrl.searchParams.set("analytics", "1");
  }
  if (isGhost) iframeUrl.searchParams.set("ghost", "1");

  var wrap = document.createElement("div");
  wrap.className = "adventure-embed-wrap";
  wrap.style.cssText =
    "width:100%;margin:0;padding:0;border:0;background:transparent;overflow:hidden;";

  var iframe = document.createElement("iframe");
  iframe.setAttribute("title", attr(scriptEl, "data-title", "Embedded story"));
  iframe.style.cssText =
    "display:block;width:100%;border:0;background:transparent;min-height:120px;height:120px;";
  iframe.setAttribute("src", iframeUrl.toString());
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
  );

  wrap.appendChild(iframe);
  scriptEl.parentNode.insertBefore(wrap, scriptEl.nextSibling);

  function onMsg(ev) {
    if (ev.origin !== playerOrigin) return;
    var d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.source !== MSG_SOURCE || d.v !== MSG_VERSION) return;
    if (d.type !== "resize" || typeof d.height !== "number" || !isFinite(d.height)) return;
    var h = Math.max(0, Math.ceil(d.height));
    iframe.style.height = h + "px";
  }

  window.addEventListener("message", onMsg, false);
})();

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import s from "../LandingPage.module.scss";

export const TRACE_W = {
  "trace-1": 1.6,
  "trace-2": 1.6,
  "trace-3": 2.1,
  "trace-4": 2.6,
  "trace-5": 3.1,
  "trace-6": 2.8,
  "trace-7": 2.9,
  "trace-8": 2.0,
} as const;

type TraceId = keyof typeof TRACE_W;

// ✅ Ne gyártsunk új objectet renderenként
const TRACE_STYLE: Record<TraceId, React.CSSProperties> = {
  "trace-1": { strokeWidth: TRACE_W["trace-1"] },
  "trace-2": { strokeWidth: TRACE_W["trace-2"] },
  "trace-3": { strokeWidth: TRACE_W["trace-3"] },
  "trace-4": { strokeWidth: TRACE_W["trace-4"] },
  "trace-5": { strokeWidth: TRACE_W["trace-5"] },
  "trace-6": { strokeWidth: TRACE_W["trace-6"] },
  "trace-7": { strokeWidth: TRACE_W["trace-7"] },
  "trace-8": { strokeWidth: TRACE_W["trace-8"] },
};

export type FlowMode = "auto" | "on" | "off";

type Props = {
  /**
   * auto: csak akkor megy, ha közel van a viewporthoz ÉS épp nem scrollozol
   * on: mindig megy (ha a szekció renderelve van)
   * off: sosem rendereli a pöttyöket (csak a trace-ek maradnak)
   */
  flowMode?: FlowMode;

  /** mennyivel előbb “aktiváljon” (auto módban) */
  rootMargin?: string;

  /** ha true: sem glow, sem node-ok (hard pause) */
  paused?: boolean;
};

function PlatformCutoutTraceInner({
  flowMode = "auto",
  rootMargin = "700px 0px",
  paused = false,
}: Props) {
 const hostRef = useRef<SVGRectElement | null>(null);

  // auto módhoz
  const [inView, setInView] = useState(flowMode === "on");
  const [scrolling, setScrolling] = useState(false);

  // ✅ viewport-gating (auto)
  useEffect(() => {
    if (paused) return;

    if (flowMode === "on") {
      setInView(true);
      return;
    }
    if (flowMode === "off") {
      setInView(false);
      return;
    }

    const el = hostRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.01, rootMargin }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [flowMode, rootMargin, paused]);

  // ✅ scroll-pause (auto)
  useEffect(() => {
    if (paused) return;
    if (flowMode !== "auto") return;

    let t: number | null = null;

    const onScroll = () => {
      setScrolling(true);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setScrolling(false), 180);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (t) window.clearTimeout(t);
    };
  }, [flowMode, paused]);

  const showGlow = !paused;
  const showNodes = useMemo(() => {
    if (paused) return false;
    if (flowMode === "off") return false;
    if (flowMode === "on") return true;
    // auto
    return inView && !scrolling;
  }, [flowMode, inView, scrolling, paused]);

  return (
    <>
      {/* ✅ az observer “anchor”-ja: ugyanabban az SVG-ben maradunk */}
      <rect
  ref={hostRef}
  x="0"
  y="0"
  width="1040"
  height="320"
  fill="transparent"
  opacity="0"
  pointerEvents="none"
/>

      {/* ── TRACE RENDSZER ── */}
      <g className={s.chipTraces}>
        <path
          id="trace-1"
          data-rank="outer"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradOuter)"
          style={TRACE_STYLE["trace-1"]}
          d="M424 36 H1010 V292"
        />
        {showGlow && (
          <path data-rank="outer" className={s.traceGlow} fill="none" d="M424 36 H1010 V292" />
        )}

        <path
          id="trace-2"
          data-rank="outer"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradOuter)"
          style={TRACE_STYLE["trace-2"]}
          d="M424 56 H992 V292"
        />
        {showGlow && (
          <path data-rank="outer" className={s.traceGlow} fill="none" d="M424 56 H992 V292" />
        )}

        <path
          id="trace-3"
          data-rank="mid"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradMid)"
          style={TRACE_STYLE["trace-3"]}
          d="M424 78 H972 V290"
        />
        {showGlow && (
          <path data-rank="mid" className={s.traceGlow} fill="none" d="M424 78 H972 V290" />
        )}

        <path
          id="trace-4"
          data-rank="mid"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradMid)"
          style={TRACE_STYLE["trace-4"]}
          d="M424 102 H948 V282"
        />
        {showGlow && (
          <path data-rank="mid" className={s.traceGlow} fill="none" d="M424 102 H948 V282" />
        )}

        <path
          id="trace-5"
          data-rank="inner"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradInner)"
          style={TRACE_STYLE["trace-5"]}
          d="M424 102 H910 V146 H935 V290"
        />
        {showGlow && (
          <path
            data-rank="inner"
            className={s.traceGlow}
            fill="none"
            d="M424 102 H910 V146 H935 V290"
          />
        )}

        <path
          id="trace-6"
          data-rank="inner"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradInner)"
          style={TRACE_STYLE["trace-6"]}
          d="M424 120 H760 V166 H880 V290"
        />
        {showGlow && (
          <path
            data-rank="inner"
            className={s.traceGlow}
            fill="none"
            d="M424 120 H760 V166 H880 V290"
          />
        )}

        <path
          id="trace-7"
          data-rank="inner"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradInner)"
          style={TRACE_STYLE["trace-7"]}
          d="M424 135 H900 V166 H910 V290"
        />
        {showGlow && (
          <path
            data-rank="inner"
            className={s.traceGlow}
            fill="none"
            d="M424 135 H900 V166 H910 V290"
          />
        )}

        <path
          id="trace-8"
          data-rank="mid"
          className={s.trace}
          fill="none"
          stroke="url(#traceGradMid)"
          style={TRACE_STYLE["trace-8"]}
          d="M424 150 H705 V198 H820 V292"
        />
        {showGlow && (
          <path data-rank="mid" className={s.traceGlow} fill="none" d="M424 150 H705 V198 H820 V292" />
        )}
      </g>

      {/* ── FLOW NODES (animateMotion) ── */}
      {showNodes && (
        <g className={s.flowNodes}>
          {/* trace-1 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="18s"
              begin="10.2s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="18s"
              begin="10.2s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-1" />
            </animateMotion>
          </circle>

          {/* trace-2 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="19.5s"
              begin="0.8s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="19.5s"
              begin="0.8s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-2" />
            </animateMotion>
          </circle>

          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="19.5s"
              begin="11.4s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="19.5s"
              begin="11.4s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-2" />
            </animateMotion>
          </circle>

          {/* trace-3 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="23s"
              begin="6.4s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="23s"
              begin="6.4s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-3" />
            </animateMotion>
          </circle>

          {/* trace-4 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="24.5s"
              begin="8.1s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="24.5s"
              begin="8.1s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-4" />
            </animateMotion>
          </circle>

          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="24.5s"
              begin="15.3s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="24.5s"
              begin="15.3s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-4" />
            </animateMotion>
          </circle>

          {/* trace-5 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="28s"
              begin="3.6s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="28s"
              begin="3.6s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-5" />
            </animateMotion>
          </circle>

          {/* trace-6 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="29.5s"
              begin="1.4s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="29.5s"
              begin="1.4s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-6" />
            </animateMotion>
          </circle>

          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="29.5s"
              begin="24.2s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="29.5s"
              begin="24.2s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-6" />
            </animateMotion>
          </circle>

          {/* trace-7 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="18.5s"
              begin="0.9s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="18.5s"
              begin="0.9s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-7" />
            </animateMotion>
          </circle>

          {/* trace-8 */}
          <circle className={s.node} r="4" opacity="0">
            <animate
              attributeName="opacity"
              dur="24s"
              begin="1.8s"
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.08;0.88;1"
            />
            <animateMotion
              dur="24s"
              begin="1.8s"
              repeatCount="indefinite"
              keyTimes="0;1"
              keySplines="0.2 0 0.2 1"
              calcMode="spline"
            >
              <mpath href="#trace-8" />
            </animateMotion>
          </circle>
        </g>
      )}
    </>
  );
}

// ✅ memo: Landing re-render nem húzza újra az egész SVG-t
export const PlatformCutout = React.memo(PlatformCutoutTraceInner);

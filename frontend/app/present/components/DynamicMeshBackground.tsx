"use client";

import React, { useEffect, useMemo, useRef } from "react";

type MeshProps = {
  intensity?: number;          // "energia" skála (nem pontszám)
  color?: string;              // "r,g,b"
  className?: string;
  style?: React.CSSProperties;

  // ✅ opcionális: a háló "fókusz" pontja (0..1). Konverziónál ezt átállítod a CTA környékére.
  focus?: { x: number; y: number }; // normált koordináta (0..1)
  focusStrength?: number;           // 0..1 (mennyire húzzon)
};

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function parseRGB(input: string) {
  const parts = input.split(",").map((v) => Number(v.trim()));
  const r = Number.isFinite(parts[0]) ? parts[0] : 255;
  const g = Number.isFinite(parts[1]) ? parts[1] : 255;
  const b = Number.isFinite(parts[2]) ? parts[2] : 255;
  return { r, g, b };
}

export const DynamicMeshBackground: React.FC<MeshProps> = ({
  intensity = 1, // ⚠️ innentől "skála", nem 6
  color = "255,255,255",
  className,
  style,
  focus,
  focusStrength = 0.6,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ✅ pontok egyszer jönnek létre
  const pointsRef = useRef<Point[]>([]);
  const rafRef = useRef<number>(0);

  // ✅ current/target paraméterek: ezeket lerp-eljük
  const currentRef = useRef({
    r: 255,
    g: 255,
    b: 255,
    intensity: 1,
    fx: 0.5,
    fy: 0.5,
    focusStrength: 0.6,
  });

  const targetRef = useRef({
    r: 255,
    g: 255,
    b: 255,
    intensity: 1,
    fx: 0.5,
    fy: 0.5,
    focusStrength: 0.6,
  });

  // cél szín/intenzitás/fókusz frissítése propból (NEM indít új loopot)
  useEffect(() => {
    const { r, g, b } = parseRGB(color);
    targetRef.current.r = r;
    targetRef.current.g = g;
    targetRef.current.b = b;

    targetRef.current.intensity = Math.max(0.2, Math.min(2.0, intensity));

    if (focus) {
      targetRef.current.fx = clamp01(focus.x);
      targetRef.current.fy = clamp01(focus.y);
    } else {
      targetRef.current.fx = 0.5;
      targetRef.current.fy = 0.5;
    }

    targetRef.current.focusStrength = Math.max(0, Math.min(1, focusStrength));
  }, [color, intensity, focus, focusStrength]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resize = () => {
      const { innerWidth, innerHeight } = window;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // ✅ egyszeri pont init (fix mennyiség a stabilitásért)
    const initPoints = () => {
      const { innerWidth: w, innerHeight: h } = window;
      const BASE_COUNT = 180; // stabil, nem ugrál intent váltáskor
      const points: Point[] = [];

      for (let i = 0; i < BASE_COUNT; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
        });
      }

      pointsRef.current = points;

      // init current értékek a targetről (első frame ne villanjon)
      const t = targetRef.current;
      currentRef.current = {
        r: t.r,
        g: t.g,
        b: t.b,
        intensity: t.intensity,
        fx: t.fx,
        fy: t.fy,
        focusStrength: t.focusStrength,
      };
    };

    initPoints();

    const step = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // ✅ smooth átmenet (szín + energia + fókusz)
      const c = currentRef.current;
      const t = targetRef.current;

      const SMOOTH = 0.06; // nagyobb = gyorsabb átmenet
      c.r = lerp(c.r, t.r, SMOOTH);
      c.g = lerp(c.g, t.g, SMOOTH);
      c.b = lerp(c.b, t.b, SMOOTH);
      c.intensity = lerp(c.intensity, t.intensity, SMOOTH);
      c.fx = lerp(c.fx, t.fx, SMOOTH);
      c.fy = lerp(c.fy, t.fy, SMOOTH);
      c.focusStrength = lerp(c.focusStrength, t.focusStrength, SMOOTH);

      const colorStr = `${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)}`;

      // ✅ ezekből épül a "hangerő"
      const NODE_ALPHA = 0.30 * c.intensity;     // finomhangolható
      const LINE_ALPHA_MAX = 0.45 * c.intensity; // finomhangolható
      const SPEED = 0.22 * c.intensity;          // finomhangolható
      const MAX_DIST = 240;                      // finomhangolható

      ctx.clearRect(0, 0, w, h);

      const points = pointsRef.current;

      // ✅ fókusz pont pixelben
      const fx = c.fx * w;
      const fy = c.fy * h;

      for (const p of points) {
        if (!prefersReduced) {
          // alap mozgás (intenzitással skálázva)
          p.x += p.vx * SPEED;
          p.y += p.vy * SPEED;

          // ✅ "reposition": finom vonzás a fókusz felé (nem teleport)
          const pull = c.focusStrength; // 0..1
          const ax = fx - p.x;
          const ay = fy - p.y;
          p.vx += ax * 0.000008 * pull;
          p.vy += ay * 0.000008 * pull;

          // perem visszapöccintés
          if (p.x < -60 || p.x > w + 60) p.vx *= 0.985;
          if (p.y < -60 || p.y > h + 60) p.vy *= 0.985;
        }

        // node
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.85, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorStr},${NODE_ALPHA})`;
        ctx.fill();
      }

      // vonalak
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const p1 = points[i];
          const p2 = points[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MAX_DIST) {
            const alpha = ((MAX_DIST - dist) / MAX_DIST) * LINE_ALPHA_MAX;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${colorStr},${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      rafRef.current = window.requestAnimationFrame(step);

    };

    step();

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []); // ✅ nincs dependency: nem resetelődik intent váltáskor

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
};

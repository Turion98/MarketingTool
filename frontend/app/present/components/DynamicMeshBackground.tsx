"use client";

import React, { useEffect, useRef } from "react";

type MeshProps = {
  intensity?: number; // "energia" skála (nem pontszám)
  color?: string; // "r,g,b"
  className?: string;
  style?: React.CSSProperties;

  // opcionális: fókusz pont (0..1) — 3D-ben kamera-tilt / pivot jelleggel használjuk
  focus?: { x: number; y: number };
  focusStrength?: number; // 0..1
};

type Point = {
  x: number;
  y: number;
  z: number; // ✅ 3D depth
  vx: number;
  vy: number;
  vz: number; // ✅ 3D velocity
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
  intensity = 1,
  color = "255,255,255",
  className,
  style,
  focus,
  focusStrength = 0.6,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const rafRef = useRef<number>(0);

  // 3D forgás szögek
  const angRef = useRef({ ax: 0, ay: 0, az: 0 });

  // current/target paraméterek: lerp-eljük
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

  // props -> target
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

    // reduce motion: mozogjon, csak lassabban
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

    const initPoints = () => {
      const { innerWidth: w, innerHeight: h } = window;

      // mobilon ritkább háló
      const BASE_COUNT = w < 720 ? 110 : 180;

      const depth = Math.min(w, h) * 0.7; // ✅ scene depth

      const points: Point[] = [];
      for (let i = 0; i < BASE_COUNT; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: (Math.random() - 0.5) * depth,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          vz: (Math.random() - 0.5) * 0.18,
        });
      }
      pointsRef.current = points;

      // első frame ne villanjon
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

      // smooth átmenet
      const c = currentRef.current;
      const t = targetRef.current;

      const SMOOTH = 0.06;
      c.r = lerp(c.r, t.r, SMOOTH);
      c.g = lerp(c.g, t.g, SMOOTH);
      c.b = lerp(c.b, t.b, SMOOTH);
      c.intensity = lerp(c.intensity, t.intensity, SMOOTH);
      c.fx = lerp(c.fx, t.fx, SMOOTH);
      c.fy = lerp(c.fy, t.fy, SMOOTH);
      c.focusStrength = lerp(c.focusStrength, t.focusStrength, SMOOTH);

      const colorStr = `${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(
        0
      )}`;

      const isMobile = w < 720;

      // reduce motion = lassabb, de nem 0
      const motion = prefersReduced ? 0.22 : 1;

      // ✅ 3D camera/projection
      const depth = Math.min(w, h) * 0.7;
      const cameraZ = depth * 1.2; // nagyobb => laposabb, kisebb => erősebb 3D

      const cx = w * 0.5;
      const cy = h * 0.5;

      // ✅ 3D forgás tempó (több tengely)
      angRef.current.ax += 0.0009 * c.intensity * motion;
      angRef.current.ay += 0.0011 * c.intensity * motion;
      angRef.current.az += 0.0007 * c.intensity * motion;

      // ✅ enyhe "focus" alapú tilt (nem szívja össze a hálót)
      const tilt = c.focusStrength * 0.75; // 0..0.75 körül
      const fxn = (c.fx - 0.5) * 2; // -1..1
      const fyn = (c.fy - 0.5) * 2; // -1..1
      const tiltY = fxn * 0.0022 * tilt * motion; // yaw
      const tiltX = -fyn * 0.0022 * tilt * motion; // pitch

      const ax = angRef.current.ax + tiltX;
      const ay = angRef.current.ay + tiltY;
      const az = angRef.current.az;

      const cax = Math.cos(ax),
        sax = Math.sin(ax);
      const cay = Math.cos(ay),
        say = Math.sin(ay);
      const caz = Math.cos(az),
        saz = Math.sin(az);

      const points = pointsRef.current;

      // ✅ projected cache (screen coords + scale)
      const projected = new Array(points.length) as Array<{
        sx: number;
        sy: number;
        s: number;
      }>;

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = isMobile ? 0.55 : 0.7;

      // alpha beállítások
      const NODE_ALPHA_BASE = (isMobile ? 0.22 : 0.30) * c.intensity;
      const LINE_ALPHA_MAX = (isMobile ? 0.22 : 0.42) * c.intensity;

      // ritkítás (screen space)
      const MAX_DIST = isMobile ? 150 : 260;
      const MAX_DIST2 = MAX_DIST * MAX_DIST;

      // pontok + 3D drift + forgás + projekció + node draw
      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // ✅ drift (nincs attractor -> nem zsugorodik)
        const SPEED = (isMobile ? 0.30 : 0.34) * c.intensity;

        p.x += p.vx * SPEED * motion;
        p.y += p.vy * SPEED * motion;
        p.z += p.vz * SPEED * motion;

        // ✅ nagyon enyhe csillapítás
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.vz *= 0.995;

        // ✅ minimum élet
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const minSp = 0.05 * motion;
        if (sp < minSp) {
          p.vx += (Math.random() - 0.5) * 0.08;
          p.vy += (Math.random() - 0.5) * 0.08;
          p.vz += (Math.random() - 0.5) * 0.05;
        }

        // ✅ wrap (folyamatosan tele a tér)
        if (p.x < -80) p.x = w + 80;
        if (p.x > w + 80) p.x = -80;
        if (p.y < -80) p.y = h + 80;
        if (p.y > h + 80) p.y = -80;
        if (p.z < -depth * 0.5) p.z = depth * 0.5;
        if (p.z > depth * 0.5) p.z = -depth * 0.5;

        // center-relative coords
        let x = p.x - cx;
        let y = p.y - cy;
        let z = p.z;

        // rotateX
        const y1 = y * cax - z * sax;
        const z1 = y * sax + z * cax;
        y = y1;
        z = z1;

        // rotateY
        const x2 = x * cay + z * say;
        const z2 = -x * say + z * cay;
        x = x2;
        z = z2;

        // rotateZ
        const x3 = x * caz - y * saz;
        const y3 = x * saz + y * caz;
        x = x3;
        y = y3;

        // perspective projection
        const scale = cameraZ / (cameraZ + z);
        const sx = cx + x * scale;
        const sy = cy + y * scale;

        projected[i] = { sx, sy, s: scale };

        // node: közelebb => erősebb, nagyobb
        const depthT = clamp01((scale - 0.6) / 0.7);
        const a = NODE_ALPHA_BASE * (0.55 + depthT * 0.75);
        const r = 0.75 + depthT * 0.9;

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorStr},${a})`;
        ctx.fill();
      }

      // vonalak (screen space dist + z/scale alapján erősítés)
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i];
          const b = projected[j];

          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          const dist2 = dx * dx + dy * dy;

          if (dist2 < MAX_DIST2) {
            const dist = Math.sqrt(dist2);
            const base = ((MAX_DIST - dist) / MAX_DIST) * LINE_ALPHA_MAX;

            // mindkettő közel van => erősebb (scale nagyobb)
            const zMix = clamp01(((a.s + b.s) * 0.5 - 0.7) / 0.8);
            const alpha = base * (0.55 + zMix * 0.8);

            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.strokeStyle = `rgba(${colorStr},${alpha})`;
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
};
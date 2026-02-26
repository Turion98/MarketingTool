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

  // bounded (nem felkúszó) 3D szögek
  const angRef = useRef({ ax: 0, ay: 0, az: 0 });

  // dt tracking
  const lastTRef = useRef<number>(0);

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

    // ✅ 3D doboz dimenziók (globális jelleggel számoljuk frame-ben is)
    const getBox = (w: number, h: number) => {
      // érdemes a képernyőnél nagyobbra venni, hogy forgásnál is “teli” legyen
      const spreadX = w * 1.6;
      const spreadY = h * 1.6;
      const spreadZ = Math.min(w, h) * 2.2;
      return { spreadX, spreadY, spreadZ };
    };

    const initPoints = () => {
      const { innerWidth: w, innerHeight: h } = window;

      const isMobile = w < 720;
      const BASE_COUNT = isMobile ? 110 : 180;

      const { spreadX, spreadY, spreadZ } = getBox(w, h);

      const points: Point[] = [];
      for (let i = 0; i < BASE_COUNT; i++) {
        points.push({
          // ✅ középpont körüli 3D doboz
          x: (Math.random() - 0.5) * spreadX + w * 0.5,
          y: (Math.random() - 0.5) * spreadY + h * 0.5,
          z: (Math.random() - 0.5) * spreadZ,

          // ✅ alap mozgás (később dt-vel skálázva)
          vx: (Math.random() - 0.5) * (isMobile ? 0.18 : 0.22),
          vy: (Math.random() - 0.5) * (isMobile ? 0.18 : 0.22),
          vz: (Math.random() - 0.5) * (isMobile ? 0.10 : 0.12),
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

      lastTRef.current = performance.now();
    };

    initPoints();

    const step = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      const now = performance.now();
      const last = lastTRef.current || now;
      let dt = (now - last) / 16.6667; // 60fps = 1.0
      dt = Math.max(0.25, Math.min(2.0, dt));
      lastTRef.current = now;

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

      const colorStr = `${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)}`;

      const isMobile = w < 720;
      const motion = prefersReduced ? 0.22 : 1;

      // ✅ 3D doboz + kamera (Z-hez igazítva)
      const { spreadX, spreadY, spreadZ } = getBox(w, h);
      const cameraZ = spreadZ * 1.8; // nagyobb = laposabb perspektíva

      const cx = w * 0.5;
      const cy = h * 0.5;

      // ✅ bounded rotation: sose “mászik fel” 90° közelébe tartósan
      const rotMotion = motion * (prefersReduced ? 0.35 : 1);
      const rotAmp = (isMobile ? 0.20 : 0.26) * c.intensity * rotMotion; // max dőlés (rad)
      const rotSpeed = (isMobile ? 0.000055 : 0.00004) * rotMotion;
      const tt = now * rotSpeed;

      angRef.current.ax = Math.sin(tt * 1.05) * rotAmp;
      angRef.current.ay = Math.cos(tt * 0.92) * rotAmp;
      angRef.current.az = Math.sin(tt * 0.70) * (rotAmp * 0.65);

      // ✅ focus tilt (kicsi)
      const tilt = c.focusStrength * 0.55;
      const fxn = (c.fx - 0.5) * 2;
      const fyn = (c.fy - 0.5) * 2;
      const tiltY = fxn * 0.0016 * tilt * motion;
      const tiltX = -fyn * 0.0016 * tilt * motion;

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

      const projected = new Array(points.length) as Array<{
        sx: number;
        sy: number;
        s: number;
      }>;

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = isMobile ? 0.55 : 0.7;

      const NODE_ALPHA_BASE = (isMobile ? 0.22 : 0.30) * c.intensity;
      const LINE_ALPHA_MAX = (isMobile ? 0.22 : 0.42) * c.intensity;

      const MAX_DIST = isMobile ? 150 : 260;
      const MAX_DIST2 = MAX_DIST * MAX_DIST;

      // ✅ doboz wrap határok
      const minX = cx - spreadX * 0.5;
      const maxX = cx + spreadX * 0.5;
      const minY = cy - spreadY * 0.5;
      const maxY = cy + spreadY * 0.5;
      const halfZ = spreadZ * 0.5;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // ✅ drift: lassabb + dt-vel
        const SPEED = (isMobile ? 0.16 : 0.18) * c.intensity;
        p.x += p.vx * SPEED * motion * dt;
        p.y += p.vy * SPEED * motion * dt;
        p.z += p.vz * SPEED * motion * dt;

        // ✅ dt-kompatibilis csillapítás
        const damp = Math.pow(0.995, dt);
        p.vx *= damp;
        p.vy *= damp;
        p.vz *= damp;

        // ✅ minimum élet
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        const minSp = 0.045 * motion;
        if (sp < minSp) {
          const kick = dt * 0.55;
          p.vx += (Math.random() - 0.5) * 0.08 * kick;
          p.vy += (Math.random() - 0.5) * 0.08 * kick;
          p.vz += (Math.random() - 0.5) * 0.05 * kick;
        }

        // ✅ wrap a 3D dobozra
        if (p.x < minX) p.x = maxX;
        else if (p.x > maxX) p.x = minX;

        if (p.y < minY) p.y = maxY;
        else if (p.y > maxY) p.y = minY;

        if (p.z < -halfZ) p.z = halfZ;
        else if (p.z > halfZ) p.z = -halfZ;

        // center-relative
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

        // perspective
        const scale = cameraZ / (cameraZ + z);
        const sx = cx + x * scale;
        const sy = cy + y * scale;

        projected[i] = { sx, sy, s: scale };

        const depthT = clamp01((scale - 0.65) / 0.75);
        const a = NODE_ALPHA_BASE * (0.55 + depthT * 0.75);
        const r = 0.72 + depthT * 0.95;

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorStr},${a})`;
        ctx.fill();
      }

      // vonalak
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

            const zMix = clamp01(((a.s + b.s) * 0.5 - 0.72) / 0.85);
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
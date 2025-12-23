"use client";

import React, { useEffect, useRef } from "react";
import s from "../LandingPage.module.scss";

type MeshProps = {
  intensity?: number;   // 0.5–1.5 körül
  color?: string;       // pl. "255,255,255" vagy "120,190,255"
};

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export const DynamicMeshBackground: React.FC<MeshProps> = ({
  intensity = 1,
  color = "255,255,255",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const dpr = window.devicePixelRatio || 1;

    const points: Point[] = [];
    const POINT_COUNT = Math.round(36 * intensity);
    const MAX_DIST = 200;
    const SPEED = 0.1 * intensity;

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

    // pontok inicializálása
    const { innerWidth, innerHeight } = window;
    for (let i = 0; i < POINT_COUNT; i++) {
      points.push({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED,
      });
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const step = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      // pontok frissítése
      for (const p of points) {
        if (!prefersReduced) {
          p.x += p.vx;
          p.y += p.vy;

          // lassú "visszapöccintés" a képernyőre
          if (p.x < -50 || p.x > w + 50) p.vx *= -1;
          if (p.y < -50 || p.y > h + 50) p.vy *= -1;
        }

        // kis node
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},0.35)`;
        ctx.fill();
      }

      // vonalak a közeli pontok között
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const p1 = points[i];
          const p2 = points[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < MAX_DIST) {
            const alpha = ((MAX_DIST - dist) / MAX_DIST) * 0.55; // közel erősebb
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${color},${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      if (!prefersReduced) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    step();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [intensity, color]);

  return <canvas ref={canvasRef} className={s.meshBackgroundCanvas} />;
};

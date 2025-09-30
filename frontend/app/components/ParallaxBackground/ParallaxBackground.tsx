"use client";

import React, { useEffect, useRef } from "react";
import styles from "./ParallaxBackground.module.scss";

type Layer = {
  src: string;
  speed: number;
  z: number;
  className?: string;
};

type Props = {
  layers: Layer[];
};

const ParallaxBackground: React.FC<Props> = ({ layers }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      mouseRef.current.x = (e.clientX - centerX) / centerX; // -1..1
      mouseRef.current.y = (e.clientY - centerY) / centerY;
    };

    const animate = (time: number) => {
      if (startTimeRef.current === null) startTimeRef.current = time;
      const elapsed = (time - startTimeRef.current) * 0.001; // másodperc

      if (!containerRef.current) return;

      layers
        .filter((l) => l.className !== "background")
        .forEach((layer, index) => {
          const el = containerRef.current?.querySelector<HTMLImageElement>(
            `[data-layer-index="${index}"]`
          );
          if (!el) return;

          const isSmoke = layer.className?.startsWith("smoke");

          // Parallax mélység
          let depthFactor = 1;
          if (layer.className === "stone2") depthFactor = 0.4;
          else if (layer.className === "stone1") depthFactor = 0.6;
          else if (layer.className === "tower") depthFactor = 0.5;
          else if (isSmoke) depthFactor = 0.8;

          const tiltX = mouseRef.current.x * 10 * depthFactor;
          const tiltY = mouseRef.current.y * 5 * depthFactor;

          if (isSmoke && layer.speed > 0) {
            // === Finomabb köd animáció ===
            const direction = index % 2 === 0 ? 1 : -1;

            const yOffset =
              Math.sin(elapsed * 0.7 + index) * 20 * layer.speed * direction;
            const xOffset =
              Math.cos(elapsed * 0.7 + index) * 10 * layer.speed * direction;

            const rotation = Math.sin(elapsed * 0.8 + index) * 1.5;
            const opacity = 0.55 + Math.sin(elapsed * 0.1 + index) * 0.5;

            el.style.transform = `
              translate(-50%, -50%)
              translate(${xOffset + tiltX}px, ${yOffset + tiltY}px)
              rotate(${rotation}deg)
            `;
            el.style.opacity = `${opacity}`;
          } else if (layer.className === "tower") {
            const rotateY = mouseRef.current.x * 10;
            const rotateX = mouseRef.current.y * -10;
            const scale = 1 + 0.002 * Math.sin(elapsed);

            el.style.transform = `
              translate(-50%, -50%) 
              rotateY(${rotateY}deg) 
              rotateX(${rotateX}deg) 
              scale(${scale})
            `;
          } else {
            const rotateY = mouseRef.current.x * 4 * depthFactor;
            const rotateX = mouseRef.current.y * -4 * depthFactor;

            el.style.transform = `
              translate(-50%, -50%) 
              translate(${tiltX}px, ${tiltY}px) 
              rotateY(${rotateY}deg) 
              rotateX(${rotateX}deg)
            `;
          }
        });

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [layers]);

  return (
    <div ref={containerRef} className={styles.parallaxContainer}>
      <img
        src={layers.find((l) => l.className === "background")?.src}
        className={styles.background}
        alt="background"
      />
      {layers
        .filter((l) => l.className !== "background")
        .map((layer, index) => (
          <img
            key={index}
            data-layer-index={index}
            src={layer.src}
            className={`${styles.parallaxLayer} ${
              layer.className ? styles[layer.className] : ""
            }`}
            alt={`parallax-layer-${index}`}
          />
        ))}
    </div>
  );
};

export default ParallaxBackground;

import bg from "@/assets/image/parallax/background.1.png";
import smoke1 from "@/assets/image/parallax/smoke.1.1.png";
import stone1 from "@/assets/image/parallax/stone1.png";
import tower from "@/assets/image/parallax/tower.png";
import smoke2 from "@/assets/image/parallax/smoke.2.png";
import smoke2_1 from "@/assets/image/parallax/smoke.2.1.png";
import stone2 from "@/assets/image/parallax/stone2.png";
import smoke3 from "@/assets/image/parallax/smoke.3.1.png";
import smoke4 from "@/assets/image/parallax/smoke.4.png";
import smoke5 from "@/assets/image/parallax/smoke.5.png";

export const layers = [
  { src: bg.src,       speed: 0,   z: 0, className: "background" },
  { src: smoke1.src,   speed: 0.5, z: 10, className: "smoke1" },
  { src: stone1.src,   speed: 0,   z: 8,  className: "stone1" },
  { src: tower.src,    speed: 0,   z: 4,  className: "tower" },
  { src: smoke2.src,   speed: 0.3,  z: 9,  className: "smoke2" },
  { src: smoke2_1.src, speed: 0.5, z: 7,  className: "smoke3" },
  { src: stone2.src,   speed: 0,   z: 6,  className: "stone2" },
  { src: smoke3.src,   speed: 0.8, z: 5,  className: "smoke4" },
  { src: smoke4.src,   speed: 0.3,z: 3,  className: "smoke5" },
  { src: smoke5.src,   speed: 0.8,z: 3,  className: "smoke6" }
];

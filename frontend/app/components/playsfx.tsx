
export const playSfx = (path: string) => {
  const audio = new Audio(path);
  audio.volume = 0.7;
  audio.play().catch(() => {});
  audio.play().catch((err) => console.warn("SFX play error", err));
};


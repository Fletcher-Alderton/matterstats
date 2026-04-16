"use client";

import { useState, useEffect, useRef } from "react";

export function WaveLogo() {
  const [clipPath, setClipPath] = useState(
    "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
  );
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = (ts - start) / 1000;
      const points: string[] = [];
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * 100;
        const wave = Math.sin((i / steps) * Math.PI * 2 + elapsed * 1.5) * 8;
        const y = Math.max(0, Math.min(100, 50 + wave));
        points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
      }
      points.push("100% 100%", "0% 100%");
      setClipPath(`polygon(${points.join(", ")})`);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="relative select-none">
      <span
        className="text-xl font-extrabold tracking-tight text-[#e0e0e0]"
        aria-hidden="true"
      >
        Matter Stats
      </span>
      <span
        className="absolute inset-0 text-xl font-extrabold tracking-tight text-[#1a1a1a]"
        style={{ clipPath, transition: "none" }}
      >
        Matter Stats
      </span>
    </div>
  );
}

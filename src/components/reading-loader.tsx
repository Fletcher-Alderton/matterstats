"use client";

import { useState, useEffect, useRef } from "react";

interface LoaderProps {
  steps: Array<{ label: string; status: "pending" | "active" | "done" }>;
  detail?: string;
  progress: number;
}

function buildWaveClipPath(baseY: number, time: number): string {
  const points: string[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 100;
    const wave = Math.sin((i / steps) * Math.PI * 2 + time) * 5;
    const y = Math.max(0, Math.min(100, baseY + wave));
    points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }
  points.push("100% 100%", "0% 100%");
  return `polygon(${points.join(", ")})`;
}

export function ReadingLoader({ steps, detail, progress }: LoaderProps) {
  const [detailFade, setDetailFade] = useState(true);
  const [clipPath, setClipPath] = useState(() => buildWaveClipPath(100, 0));
  const prevDetail = useRef(detail);
  const rafRef = useRef<number>(0);

  const displayedProgress = useRef(0);

  // Animate the wave with smooth interpolation
  useEffect(() => {
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = (ts - start) / 1000;
      // Lerp toward target progress
      displayedProgress.current += (progress - displayedProgress.current) * 0.04;
      const baseY = 100 - displayedProgress.current;
      setClipPath(buildWaveClipPath(baseY, elapsed));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [progress]);

  // Fade detail text on change
  useEffect(() => {
    if (detail !== prevDetail.current) {
      const fadeOut = setTimeout(() => setDetailFade(false), 0);
      const fadeIn = setTimeout(() => {
        prevDetail.current = detail;
        setDetailFade(true);
      }, 150);
      return () => {
        clearTimeout(fadeOut);
        clearTimeout(fadeIn);
      };
    }
  }, [detail]);

  const activeStep = steps.find((s) => s.status === "active");

  return (
    <div className="loader-screen">
      <div className="loader-title-wrap">
        <span className="loader-title loader-title-bg" aria-hidden="true">
          Matter
          <br />
          Stats
        </span>
        <span
          className="loader-title loader-title-fg"
          style={{ clipPath, transition: "none" }}
        >
          Matter
          <br />
          Stats
        </span>
      </div>

      <div className="loader-bottom">
        <div className="loader-bottom-left">
          {activeStep && (
            <p className="loader-step">{activeStep.label}</p>
          )}
          <p
            className="loader-detail"
            style={{ opacity: detailFade ? 1 : 0 }}
          >
            {detail || "\u00A0"}
          </p>
        </div>

        <div className="loader-bottom-right">
          <p className="loader-pct">
            loading... {Math.round(progress)}%
          </p>
        </div>
      </div>
    </div>
  );
}

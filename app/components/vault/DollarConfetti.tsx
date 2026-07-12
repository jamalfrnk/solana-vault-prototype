"use client";

import { useEffect, useState } from "react";

/**
 * Green dollar-themed confetti burst (M17 Phase 5). Fires once per burstKey
 * (the confirmed transaction signature), cleans itself up after the fall
 * completes, captures no pointer events, and is skipped entirely under
 * prefers-reduced-motion. Pieces are stylized green rectangles and dollar
 * signs — deliberately abstract, no currency imagery.
 */

const GREENS = ["#2ecc71", "#27ae60", "#1e8f4d", "#66d98f", "#9fe8c4"];
const PIECE_COUNT = 56;
const CLEANUP_MS = 3400;

interface Piece {
  dollar: boolean;
  left: number;
  color: string;
  dx: number;
  rot: number;
  duration: number;
  delay: number;
}

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePieces(key: string): Piece[] {
  const rand = mulberry32(hashKey(key));
  return Array.from({ length: PIECE_COUNT }, () => ({
    dollar: rand() < 0.3,
    left: rand() * 100,
    color: GREENS[Math.floor(rand() * GREENS.length)],
    dx: (rand() - 0.5) * 220,
    rot: (rand() - 0.5) * 720,
    duration: 2.1 + rand() * 1.1,
    delay: rand() * 0.5,
  }));
}

export function DollarConfetti({ burstKey }: { burstKey: string | null }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!burstKey) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setActiveKey(burstKey);
    const timer = setTimeout(() => setActiveKey(null), CLEANUP_MS);
    return () => clearTimeout(timer);
  }, [burstKey]);

  if (!activeKey) return null;

  return (
    <div className="confetti" aria-hidden="true" data-testid="confetti">
      {generatePieces(activeKey).map((p, i) => {
        const style = {
          left: `${p.left}%`,
          "--c": p.color,
          "--dx": `${p.dx}px`,
          "--rot": `${p.rot}deg`,
          "--dur": `${p.duration}s`,
          "--delay": `${p.delay}s`,
        } as React.CSSProperties;
        return p.dollar ? (
          <span key={i} className="confetti-dollar" style={style}>
            $
          </span>
        ) : (
          <span key={i} className="confetti-piece" style={style} />
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * App-wide starry background with cursor parallax (M17).
 *
 * - Three depth layers; the near layer shifts most as the cursor moves, so the
 *   field reads as parallax rather than a flat texture.
 * - Star positions come from a SEEDED PRNG, not Math.random(): the component
 *   is server-rendered by Next, and nondeterministic positions would cause a
 *   hydration mismatch (server markup ≠ client markup).
 * - Decorative only: fixed, behind all content, pointer-events: none,
 *   aria-hidden. Parallax and twinkle are disabled under
 *   prefers-reduced-motion (listener never attached; CSS kills the keyframes).
 */

const LAYERS = [
  { count: 50, size: 1, drift: 8, opacity: 0.55 },
  { count: 34, size: 1.6, drift: 18, opacity: 0.75 },
  { count: 16, size: 2.4, drift: 32, opacity: 0.95 },
] as const;

/** mulberry32 — tiny deterministic PRNG; fixed seed keeps SSR/CSR identical. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  left: number;
  top: number;
  twinkleDuration: number;
  twinkleDelay: number;
}

function generateStars(): Star[][] {
  const rand = mulberry32(0x5741_6c74); // "VAlt"
  return LAYERS.map(({ count }) =>
    Array.from({ length: count }, () => ({
      left: rand() * 100,
      top: rand() * 100,
      twinkleDuration: 2.5 + rand() * 4,
      twinkleDelay: rand() * 6,
    })),
  );
}

export function StarfieldBackground() {
  const stars = useMemo(generateStars, []);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    const onMove = (e: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Normalized cursor offset from viewport center, in [-1, 1].
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        LAYERS.forEach((layer, i) => {
          const el = layerRefs.current[i];
          if (el) {
            // Stars shift opposite the cursor, like looking past a window.
            el.style.transform = `translate3d(${-nx * layer.drift}px, ${-ny * layer.drift}px, 0)`;
          }
        });
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="starfield" aria-hidden="true" data-testid="starfield">
      {LAYERS.map((layer, i) => (
        <div
          key={i}
          className="starfield-layer"
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
        >
          {stars[i].map((star, j) => (
            <span
              key={j}
              className="starfield-star"
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: `${layer.size}px`,
                height: `${layer.size}px`,
                opacity: layer.opacity,
                animationDuration: `${star.twinkleDuration}s`,
                animationDelay: `${star.twinkleDelay}s`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

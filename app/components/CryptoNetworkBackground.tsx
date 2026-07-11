"use client";

import { useEffect, useRef } from "react";

/**
 * App-wide background: a drifting network of cryptocurrency logos connected by
 * proximity lines, both reacting to cursor movement (M17).
 *
 * Only the top-15 cryptocurrencies by market cap are represented (verified
 * against live rankings on 2026-07-11 — see the M17 docs); each appears more
 * than once so the field reads as a constellation rather than 15 lonely dots.
 * Logos are canvas-drawn ticker badges in each asset's brand color — no
 * bundled image assets, no trademark files in the repo, no dependencies.
 *
 * - Canvas + rAF; nodes drift slowly and bounce softly off the edges.
 * - The cursor repels nearby nodes (inverse-square falloff), so logos AND the
 *   lines between them move as the pointer moves.
 * - Decorative only: fixed, behind content, pointer-events: none, aria-hidden.
 * - prefers-reduced-motion: a single static frame is drawn; no drift, no
 *   cursor reaction, no animation loop.
 * - jsdom-safe: bails out when a 2D context is unavailable.
 */

interface CoinDef {
  ticker: string;
  color: string;
  /** Dark badge text needs a light disc (e.g. XRP/XLM brand marks are black). */
  darkText?: boolean;
}

/** Top 15 by market cap, in rank order (2026-07-11). */
const COINS: CoinDef[] = [
  { ticker: "BTC", color: "#f7931a" },
  { ticker: "ETH", color: "#627eea" },
  { ticker: "USDT", color: "#26a17b" },
  { ticker: "BNB", color: "#f3ba2f" },
  { ticker: "USDC", color: "#2775ca" },
  { ticker: "XRP", color: "#e8ecf1", darkText: true },
  { ticker: "SOL", color: "#14f195", darkText: true },
  { ticker: "TRX", color: "#ef0027" },
  { ticker: "HYPE", color: "#97fce4", darkText: true },
  { ticker: "DOGE", color: "#c2a633" },
  { ticker: "USDS", color: "#f5ac37", darkText: true },
  { ticker: "LEO", color: "#f79420" },
  { ticker: "ZEC", color: "#f4b728", darkText: true },
  { ticker: "XLM", color: "#e8ecf1", darkText: true },
  { ticker: "ADA", color: "#2a5ada" },
];

const COPIES = 2; // each coin appears twice → 30 nodes
const LINK_DISTANCE = 170;
const CURSOR_RADIUS = 190;
const DRIFT_SPEED = 0.18;

interface Node {
  coin: CoinDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
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

export function CryptoNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rand = mulberry32(0xc0ffee);
    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    const cursor = { x: -10_000, y: -10_000 };
    let rafId = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedNodes() {
      nodes = [];
      for (let c = 0; c < COPIES; c++) {
        for (const coin of COINS) {
          const angle = rand() * Math.PI * 2;
          nodes.push({
            coin,
            x: rand() * width,
            y: rand() * height,
            vx: Math.cos(angle) * DRIFT_SPEED,
            vy: Math.sin(angle) * DRIFT_SPEED,
            r: 15 + rand() * 7,
          });
        }
      }
    }

    function drawFrame() {
      ctx!.clearRect(0, 0, width, height);

      // Proximity lines first, beneath the badges.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            const alpha = (1 - dist / LINK_DISTANCE) * 0.32;
            ctx!.strokeStyle = `rgba(122, 162, 255, ${alpha.toFixed(3)})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.stroke();
          }
        }
      }

      for (const node of nodes) {
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx!.fillStyle = node.coin.color;
        ctx!.globalAlpha = 0.85;
        ctx!.shadowColor = node.coin.color;
        ctx!.shadowBlur = 12;
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 1;

        ctx!.fillStyle = node.coin.darkText ? "#101426" : "#ffffff";
        ctx!.font = `600 ${node.r * 0.62}px system-ui, sans-serif`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(node.coin.ticker, node.x, node.y + 0.5);
      }
    }

    function step() {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        // Cursor repulsion with inverse-square falloff.
        const dx = node.x - cursor.x;
        const dy = node.y - cursor.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CURSOR_RADIUS && dist > 1) {
          const force = ((CURSOR_RADIUS - dist) / CURSOR_RADIUS) ** 2 * 2.2;
          node.x += (dx / dist) * force;
          node.y += (dy / dist) * force;
        }

        // Soft bounce at the edges.
        if (node.x < -node.r) node.vx = Math.abs(node.vx);
        if (node.x > width + node.r) node.vx = -Math.abs(node.vx);
        if (node.y < -node.r) node.vy = Math.abs(node.vy);
        if (node.y > height + node.r) node.vy = -Math.abs(node.vy);
      }
      drawFrame();
      rafId = requestAnimationFrame(step);
    }

    const onMove = (e: MouseEvent) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
    };
    const onResize = () => {
      resize();
      drawFrame();
    };

    resize();
    seedNodes();

    if (reducedMotion) {
      drawFrame(); // one static frame, no loop, no cursor listener
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="crypto-network"
      aria-hidden="true"
      data-testid="crypto-network"
    />
  );
}

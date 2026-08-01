"use client";

/**
 * Transaction-success "cha-ching" (M17 Phase 5).
 *
 * The sound is SYNTHESIZED at runtime with the Web Audio API — two bell
 * strikes plus an overtone shimmer — so the repo ships no audio asset at all:
 * nothing to license, nothing to attribute (documented in docs/UI_VAULT.md).
 *
 * Rules enforced here:
 * - never autoplays: play() is only reached from a confirmed transaction,
 *   which required a user gesture (the submit click) — satisfying browser
 *   autoplay policies;
 * - muted preference persists in localStorage;
 * - any audio failure is swallowed — sound must never break the tx UI.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "vault-sound-muted";
const VOLUME = 0.14; // moderate; well below full scale

/** A bell hit: fundamental plus inharmonic partials (real bells aren't pure
 *  sines — the 2.4x/3.7x partials are what make it read as struck metal). */
function bellStrike(
  ctx: AudioContext,
  at: number,
  fundamental: number,
  peak: number,
  duration: number,
): void {
  const partials: Array<[ratio: number, level: number]> = [
    [1, 1],
    [2.4, 0.45],
    [3.7, 0.22],
    [5.2, 0.08],
  ];
  for (const [ratio, level] of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = fundamental * ratio;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak * level, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      at + duration / ratio ** 0.5,
    );
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }
}

/** The register drawer: a short band-passed noise burst (the slide) — the
 *  "cha" before the bell's "ching". */
function drawerSlide(ctx: AudioContext, at: number, peak: number): void {
  const length = Math.floor(ctx.sampleRate * 0.09);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(at);
}

/** The drawer hitting its stop: a quick low thump with a downward sweep. */
function drawerThump(ctx: AudioContext, at: number, peak: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(170, at);
  osc.frequency.exponentialRampToValueAtTime(75, at + 0.1);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.15);
}

export function useSoundEffect() {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(MUTE_KEY) === "true";
      mutedRef.current = stored;
      setMuted(stored);
    } catch {
      // storage unavailable — default to sound on
    }
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      mutedRef.current = next;
      try {
        localStorage.setItem(MUTE_KEY, String(next));
      } catch {
        // preference just won't persist
      }
      return next;
    });
  }, []);

  /** Plays the cha-ching once. Safe to call anywhere; never throws. */
  const play = useCallback(() => {
    if (mutedRef.current) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      ctxRef.current ??= new Ctor();
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      // Cash register: drawer slides ("cha"), thumps its stop, and the
      // double bell rings ("ching-ching").
      const t = ctx.currentTime;
      drawerSlide(ctx, t, VOLUME * 0.7);
      drawerThump(ctx, t + 0.05, VOLUME * 0.9);
      bellStrike(ctx, t + 0.07, 2350, VOLUME, 0.55); // first ding
      bellStrike(ctx, t + 0.19, 2350, VOLUME * 0.85, 0.9); // second, ringing out
    } catch {
      // audio failure must never break the transaction UI
    }
  }, []);

  return { play, muted, toggleMuted };
}

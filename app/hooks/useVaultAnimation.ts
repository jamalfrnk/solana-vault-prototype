"use client";

/**
 * Vault door animation state machine (M17 Phase 4).
 *
 *   closed → unlocking → opening → open → closing → closed
 *            (wheel spins,  (door     (dwell)  (door swings
 *             bolts retract) swings)            shut, relock)
 *
 * The stages drive CSS only — transaction confirmation NEVER waits on this
 * (the lifecycle hook resolves independently; Phase 6 calls openVault() from
 * an already-confirmed success). Under prefers-reduced-motion the sequence
 * collapses to a simple fade: closed → open → closed with no intermediate
 * stages, matching the CSS which replaces the swing with opacity.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type VaultStage = "closed" | "unlocking" | "opening" | "open" | "closing";

/** Combination dial (2.3s: three turns right, two left, one right) + handle turn (0.6s). */
export const UNLOCK_MS = 2900;
export const SWING_MS = 900;
export const DWELL_MS = 5000;
export const CLOSE_MS = 900;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useVaultAnimation({ dwellMs = DWELL_MS }: { dwellMs?: number } = {}) {
  const [stage, setStage] = useState<VaultStage>("closed");
  // Ref mirror so openVault's not-closed guard doesn't run side effects
  // (timer scheduling) inside a state updater — React StrictMode invokes
  // updaters twice in development, which would double every timer.
  const stageRef = useRef<VaultStage>("closed");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const transition = useCallback((next: VaultStage) => {
    stageRef.current = next;
    setStage(next);
  }, []);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const schedule = useCallback(
    (next: VaultStage, ms: number) => {
      timers.current.push(setTimeout(() => transition(next), ms));
    },
    [transition],
  );

  const closeVault = useCallback(() => {
    clearTimers();
    if (prefersReducedMotion()) {
      transition("closed");
      return;
    }
    transition("closing");
    schedule("closed", CLOSE_MS);
  }, [clearTimers, schedule, transition]);

  /** Runs the full open sequence, dwells, then closes. No-op unless closed —
   *  a second confirmed transaction while the door is moving queues nothing
   *  and breaks nothing (the balance display inside is already current). */
  const openVault = useCallback(() => {
    if (stageRef.current !== "closed") return;

    if (prefersReducedMotion()) {
      transition("open");
      schedule("closed", dwellMs);
      return;
    }

    transition("unlocking");
    schedule("opening", UNLOCK_MS);
    schedule("open", UNLOCK_MS + SWING_MS);
    schedule("closing", UNLOCK_MS + SWING_MS + dwellMs);
    schedule("closed", UNLOCK_MS + SWING_MS + dwellMs + CLOSE_MS);
  }, [dwellMs, schedule, transition]);

  return { stage, openVault, closeVault };
}

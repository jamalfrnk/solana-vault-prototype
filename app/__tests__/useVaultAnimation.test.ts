import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  useVaultAnimation,
  UNLOCK_MS,
  SWING_MS,
  CLOSE_MS,
} from "../hooks/useVaultAnimation";

describe("useVaultAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts closed", () => {
    const { result } = renderHook(() => useVaultAnimation());
    expect(result.current.stage).to.equal("closed");
  });

  it("runs the full sequence: unlocking → opening → open → closing → closed", () => {
    const { result } = renderHook(() => useVaultAnimation({ dwellMs: 1000 }));

    act(() => result.current.openVault());
    expect(result.current.stage).to.equal("unlocking");

    act(() => vi.advanceTimersByTime(UNLOCK_MS));
    expect(result.current.stage).to.equal("opening");

    act(() => vi.advanceTimersByTime(SWING_MS));
    expect(result.current.stage).to.equal("open");

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.stage).to.equal("closing");

    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(result.current.stage).to.equal("closed");
  });

  it("ignores openVault while a sequence is already running (no restart, no double-timers)", () => {
    const { result } = renderHook(() => useVaultAnimation({ dwellMs: 1000 }));

    act(() => result.current.openVault());
    act(() => vi.advanceTimersByTime(UNLOCK_MS));
    expect(result.current.stage).to.equal("opening");

    act(() => result.current.openVault()); // mid-sequence: must be a no-op
    expect(result.current.stage).to.equal("opening");

    act(() => vi.advanceTimersByTime(SWING_MS));
    expect(result.current.stage).to.equal("open");
    act(() => vi.advanceTimersByTime(1000 + CLOSE_MS));
    expect(result.current.stage).to.equal("closed");

    // And a fresh open works again afterwards.
    act(() => result.current.openVault());
    expect(result.current.stage).to.equal("unlocking");
  });

  it("closeVault interrupts the sequence and shuts the door gracefully", () => {
    const { result } = renderHook(() => useVaultAnimation({ dwellMs: 60_000 }));

    act(() => result.current.openVault());
    act(() => vi.advanceTimersByTime(UNLOCK_MS + SWING_MS));
    expect(result.current.stage).to.equal("open");

    act(() => result.current.closeVault());
    expect(result.current.stage).to.equal("closing");
    act(() => vi.advanceTimersByTime(CLOSE_MS));
    expect(result.current.stage).to.equal("closed");
  });

  it("cleans up timers on unmount (no state updates after unmount)", () => {
    const { result, unmount } = renderHook(() => useVaultAnimation({ dwellMs: 1000 }));
    act(() => result.current.openVault());
    unmount();
    // Advancing past every scheduled transition must not throw or warn.
    act(() => vi.advanceTimersByTime(UNLOCK_MS + SWING_MS + 1000 + CLOSE_MS + 100));
  });
});

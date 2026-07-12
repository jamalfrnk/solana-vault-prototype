import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSoundEffect } from "../hooks/useSoundEffect";

describe("useSoundEffect", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to sound on", () => {
    const { result } = renderHook(() => useSoundEffect());
    expect(result.current.muted).to.equal(false);
  });

  it("play() never throws, even without Web Audio support (jsdom)", () => {
    const { result } = renderHook(() => useSoundEffect());
    act(() => result.current.play());
  });

  it("toggle persists the muted preference", () => {
    const { result } = renderHook(() => useSoundEffect());
    act(() => result.current.toggleMuted());
    expect(result.current.muted).to.equal(true);
    expect(localStorage.getItem("vault-sound-muted")).to.equal("true");

    const { result: fresh } = renderHook(() => useSoundEffect());
    expect(fresh.current.muted).to.equal(true);
  });

  it("muted play() is a silent no-op", () => {
    const { result } = renderHook(() => useSoundEffect());
    act(() => result.current.toggleMuted());
    act(() => result.current.play());
  });
});

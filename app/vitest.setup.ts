import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// jest-canvas-mock's internals reference the `jest` global directly (it
// predates Vitest); Vitest's `vi` is API-compatible. Static imports are
// hoisted above top-level statements in ES modules, so the alias has to be
// set before a *dynamic* import of jest-canvas-mock, not a static one.
(globalThis as unknown as { jest: typeof vi }).jest = vi;
await import("jest-canvas-mock");

afterEach(cleanup);

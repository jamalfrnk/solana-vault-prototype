// Known limitation (see M14 ROADMAP entry / ARCHITECTURE.md): wallet-adapter has no
// reliable, portable API to query which cluster a connected wallet is actually on.
// This banner shows the app's *configured* cluster only — it does not detect or warn
// on an actual wallet/app cluster mismatch. That stronger check is explicitly not
// implemented; this test only proves the static banner renders correctly.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ClusterWarningBanner } from "../components/ClusterWarningBanner";
import { CONFIGURED_CLUSTER } from "../lib/solana/connection";

describe("ClusterWarningBanner", () => {
  it("renders the app's configured cluster name", () => {
    render(<ClusterWarningBanner />);
    expect(screen.getByRole("status").textContent).to.match(new RegExp(CONFIGURED_CLUSTER, "i"));
  });
});

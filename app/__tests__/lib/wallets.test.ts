import { describe, it, expect } from "vitest";

import { getWallets } from "../../lib/solana/wallets";

describe("getWallets", () => {
  it("returns exactly the two supported wallet adapters, Phantom and Solflare", () => {
    const wallets = getWallets();
    expect(wallets.map((w) => w.name)).to.deep.equal(["Phantom", "Solflare"]);
  });

  it("returns fresh adapter instances on each call", () => {
    const first = getWallets();
    const second = getWallets();
    expect(first[0]).to.not.equal(second[0]);
    expect(first[1]).to.not.equal(second[1]);
  });
});

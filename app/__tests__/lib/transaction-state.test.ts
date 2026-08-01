import { describe, it, expect } from "vitest";

import { isBusy, signatureOf, TxState } from "../../lib/transaction-state";
import {
  classifyError,
  isWalletRejection,
} from "../../lib/transaction-messages";

describe("transaction state", () => {
  it("isBusy covers exactly the in-flight phases", () => {
    const busy: TxState[] = [
      { phase: "validating" },
      { phase: "awaiting_wallet" },
      { phase: "confirming", signature: "s" },
    ];
    const notBusy: TxState[] = [
      { phase: "idle" },
      { phase: "success", signature: "s" },
      { phase: "error", kind: "unknown", message: "m" },
      { phase: "cancelled" },
    ];
    for (const s of busy) expect(isBusy(s), s.phase).to.equal(true);
    for (const s of notBusy) expect(isBusy(s), s.phase).to.equal(false);
  });

  it("signatureOf surfaces the signature from any phase that carries one", () => {
    expect(signatureOf({ phase: "confirming", signature: "a" })).to.equal("a");
    expect(signatureOf({ phase: "success", signature: "b" })).to.equal("b");
    expect(
      signatureOf({
        phase: "error",
        kind: "unknown",
        message: "m",
        signature: "c",
      }),
    ).to.equal("c");
    expect(
      signatureOf({ phase: "error", kind: "unknown", message: "m" }),
    ).to.equal(null);
    expect(signatureOf({ phase: "idle" })).to.equal(null);
  });
});

describe("error classification", () => {
  it("recognizes wallet rejection as cancellation", () => {
    expect(isWalletRejection(new Error("User rejected the request"))).to.equal(
      true,
    );
    expect(isWalletRejection(new Error("insufficient funds"))).to.equal(false);
  });

  it("classifies blockhash expiry", () => {
    expect(
      classifyError(new Error("TransactionExpiredBlockheightExceededError"))
        .kind,
    ).to.equal("blockhash_expired");
  });

  it("classifies confirmation timeout without declaring failure certain", () => {
    const c = classifyError(
      new Error("Transaction was not confirmed: timed out"),
    );
    expect(c.kind).to.equal("confirmation_timeout");
    expect(c.message).to.match(/may still land/i);
  });

  it("classifies simulation failure with a devnet hint", () => {
    const c = classifyError(
      new Error("Transaction simulation failed: unknown account"),
    );
    expect(c.kind).to.equal("simulation_failure");
    expect(c.message).to.match(/devnet/i);
  });

  it("classifies RPC connectivity failures", () => {
    expect(classifyError(new Error("Failed to fetch")).kind).to.equal(
      "rpc_failure",
    );
  });

  it("classifies vault program errors with the decoded message", () => {
    const c = classifyError({
      logs: [
        "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq invoke [1]",
        "Program log: AnchorError thrown in programs/solana-vault-prototype/src/instructions/deposit.rs:64. Error Code: VaultPaused. Error Number: 6000. Error Message: Vault is paused.",
      ],
    });
    expect(c.kind).to.equal("program_error");
    expect(c.message).to.match(/vault is paused/i);
  });

  it("falls back to unknown with the raw detail preserved", () => {
    const c = classifyError(new Error("some novel explosion"));
    expect(c.kind).to.equal("unknown");
    expect(c.message).to.match(/some novel explosion/);
  });
});

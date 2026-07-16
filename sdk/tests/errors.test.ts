import { expect } from "chai";
import { SendTransactionError } from "@solana/web3.js";

import {
  VaultErrorCode,
  parseVaultError,
  parseVaultErrorFromLogs,
} from "../src/errors";

function anchorErrorLogs(
  errorCode: string,
  errorNumber: number,
  message: string
): string[] {
  return [
    "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq invoke [1]",
    `Program log: AnchorError thrown in programs/solana-vault-prototype/src/instructions/deposit.rs:64. Error Code: ${errorCode}. Error Number: ${errorNumber}. Error Message: ${message}.`,
    "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq consumed 5000 of 200000 compute units",
    "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq failed: custom program error: 0x1772",
  ];
}

describe("errors", () => {
  describe("parseVaultErrorFromLogs", () => {
    it("parses VaultPaused (6000)", () => {
      const result = parseVaultErrorFromLogs(
        anchorErrorLogs("VaultPaused", 6000, "Vault is paused")
      );
      expect(result.code).to.equal(VaultErrorCode.VaultPaused);
      expect(result.message).to.include("Vault is paused");
    });

    it("parses InsufficientShares (6001)", () => {
      const result = parseVaultErrorFromLogs(
        anchorErrorLogs(
          "InsufficientShares",
          6001,
          "Insufficient shares for withdrawal"
        )
      );
      expect(result.code).to.equal(VaultErrorCode.InsufficientShares);
    });

    it("parses InvalidVaultAuthorityOwner (6007)", () => {
      const result = parseVaultErrorFromLogs(
        anchorErrorLogs(
          "InvalidVaultAuthorityOwner",
          6007,
          "vault_authority PDA is not owned by the System Program"
        )
      );
      expect(result.code).to.equal(VaultErrorCode.InvalidVaultAuthorityOwner);
      expect(result.message).to.include("System Program");
    });

    it("recognizes every M21-M25 migration, config, cap, transition, and recovery error number", () => {
      const expected = [
        VaultErrorCode.UnsupportedVaultVersion,
        VaultErrorCode.VaultStateAlreadyMigrated,
        VaultErrorCode.InvalidLegacyReservedBytes,
        VaultErrorCode.InvalidLegacyOperationalState,
        VaultErrorCode.InvalidVaultStateSize,
        VaultErrorCode.InvalidVaultStatePda,
        VaultErrorCode.InvalidVaultBump,
        VaultErrorCode.InvalidAuthorityBump,
        VaultErrorCode.InvalidOperationalStateTransition,
        VaultErrorCode.InvalidProgramData,
        VaultErrorCode.InvalidProtocolRole,
        VaultErrorCode.DuplicateProtocolRole,
        VaultErrorCode.UnsupportedProtocolConfigVersion,
        VaultErrorCode.InvalidProtocolConfigReservedBytes,
        VaultErrorCode.InvalidProtocolTokenProgram,
        VaultErrorCode.InvalidEmergencyStateTransition,
        VaultErrorCode.MintAuthorityPresent,
        VaultErrorCode.UnsupportedMintConfigVersion,
        VaultErrorCode.InvalidMintConfigReservedBytes,
        VaultErrorCode.InvalidMintConfigPendingState,
        VaultErrorCode.InvalidMintConfigMint,
        VaultErrorCode.MintDisabled,
        VaultErrorCode.DepositCapExceeded,
        VaultErrorCode.MaxTotalAssetsExceeded,
        VaultErrorCode.InvalidMintCaps,
        VaultErrorCode.CapReductionRequired,
        VaultErrorCode.InvalidMintConfigUpdate,
        VaultErrorCode.NoPendingMintConfigUpdate,
        VaultErrorCode.MintConfigUpdateNotReady,
        VaultErrorCode.TimestampOverflow,
        VaultErrorCode.ArithmeticOverflow,
        VaultErrorCode.CustodyShortfall,
        VaultErrorCode.NoExcessToSweep,
        VaultErrorCode.ExcessRecoveryRequiresPausedVault,
        VaultErrorCode.InvalidTreasury,
      ];
      for (const number of expected) {
        const result = parseVaultErrorFromLogs(
          anchorErrorLogs(
            VaultErrorCode[number],
            number,
            "M21 migration failure"
          )
        );
        expect(result.code).to.equal(number);
      }
    });

    it("returns code undefined, no throw, for logs with no AnchorError line", () => {
      const result = parseVaultErrorFromLogs([
        "Program 11111111111111111111111111111111 invoke [1]",
        "Program 11111111111111111111111111111111 success",
      ]);
      expect(result.code).to.equal(undefined);
    });

    it("returns code undefined but keeps a message for an out-of-range Anchor error number", () => {
      const result = parseVaultErrorFromLogs(
        anchorErrorLogs(
          "ConstraintSeeds",
          2006,
          "A seeds constraint was violated"
        )
      );
      expect(result.code).to.equal(undefined);
      expect(result.message).to.include("seeds constraint");
    });

    it("handles undefined logs without throwing", () => {
      const result = parseVaultErrorFromLogs(undefined);
      expect(result.code).to.equal(undefined);
    });
  });

  describe("parseVaultError", () => {
    it("unwraps a real SendTransactionError via .transactionError.logs", () => {
      const err = new SendTransactionError({
        action: "send",
        signature: "5x".repeat(32),
        transactionMessage: "Transaction simulation failed",
        logs: anchorErrorLogs(
          "ZeroAmount",
          6002,
          "Amount must be greater than zero"
        ),
      });
      const result = parseVaultError(err);
      expect(result.code).to.equal(VaultErrorCode.ZeroAmount);
    });

    it("falls back to a plain .logs field on a generic error-like object", () => {
      const err = {
        logs: anchorErrorLogs("Unauthorized", 6005, "Unauthorized"),
      };
      const result = parseVaultError(err);
      expect(result.code).to.equal(VaultErrorCode.Unauthorized);
    });

    it("does not throw on a value with no logs at all", () => {
      const result = parseVaultError(new Error("network timeout"));
      expect(result.code).to.equal(undefined);
    });
  });
});

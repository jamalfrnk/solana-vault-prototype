use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Insufficient shares for withdrawal")]
    InsufficientShares,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Division by zero: total_assets or total_shares is zero")]
    ZeroDenominator,
    #[msg("Token mint does not match vault mint")]
    MintMismatch,
    #[msg("Unauthorized: signer does not match expected authority")]
    Unauthorized,
    #[msg("Mint has an active freeze authority; vault requires a freeze-authority-free mint")]
    FreezeAuthorityPresent,
    #[msg("vault_authority PDA is not owned by the System Program")]
    InvalidVaultAuthorityOwner,
    #[msg("No pending pause authority to accept")]
    NoPendingAuthority,
    #[msg("Proposed pause authority is invalid (default pubkey)")]
    InvalidNewAuthority,
    #[msg(
        "VaultState version is unsupported; version 0 must migrate and only version 1 is current"
    )]
    UnsupportedVaultVersion,
    #[msg("VaultState has already been migrated to version 1")]
    VaultStateAlreadyMigrated,
    #[msg("Legacy VaultState reserved bytes must all be zero before migration")]
    InvalidLegacyReservedBytes,
    #[msg("Legacy VaultState operational byte must be Active (0) or ExitOnly (1)")]
    InvalidLegacyOperationalState,
    #[msg("VaultState account length does not match the exact 145-byte layout")]
    InvalidVaultStateSize,
    #[msg("VaultState address is not the canonical PDA for its stored mint")]
    InvalidVaultStatePda,
    #[msg("Stored vault bump is not canonical")]
    InvalidVaultBump,
    #[msg("Stored vault-authority bump is not canonical")]
    InvalidAuthorityBump,
    #[msg("The pause authority cannot perform this operational-state transition")]
    InvalidOperationalStateTransition,
}

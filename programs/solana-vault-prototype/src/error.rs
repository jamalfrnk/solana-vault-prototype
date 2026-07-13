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
}

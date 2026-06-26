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
}

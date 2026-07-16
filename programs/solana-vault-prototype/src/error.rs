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
    #[msg("ProgramData is not the canonical upgradeable-loader account for this program")]
    InvalidProgramData,
    #[msg("ProtocolConfig role addresses must not be the default pubkey")]
    InvalidProtocolRole,
    #[msg("ProtocolConfig governance, emergency, and treasury addresses must be distinct")]
    DuplicateProtocolRole,
    #[msg("ProtocolConfig version is unsupported; only version 1 is current")]
    UnsupportedProtocolConfigVersion,
    #[msg("ProtocolConfig reserved bytes must all be zero")]
    InvalidProtocolConfigReservedBytes,
    #[msg("ProtocolConfig token program must be the canonical legacy SPL Token Program")]
    InvalidProtocolTokenProgram,
    #[msg("The emergency authority cannot perform this operational-state transition")]
    InvalidEmergencyStateTransition,
    #[msg("Mint has an active mint authority; the approved initial mint must have fixed supply")]
    MintAuthorityPresent,
    #[msg("MintConfig version is unsupported; only version 1 is current")]
    UnsupportedMintConfigVersion,
    #[msg("MintConfig reserved bytes must all be zero")]
    InvalidMintConfigReservedBytes,
    #[msg("MintConfig pending-update fields are malformed")]
    InvalidMintConfigPendingState,
    #[msg("MintConfig does not match the requested mint")]
    InvalidMintConfigMint,
    #[msg("Mint is disabled by its on-chain MintConfig")]
    MintDisabled,
    #[msg("Per-transaction deposit cap exceeded")]
    DepositCapExceeded,
    #[msg("Deposit would exceed the configured maximum total assets")]
    MaxTotalAssetsExceeded,
    #[msg("Per-transaction cap must not exceed the maximum total-assets cap")]
    InvalidMintCaps,
    #[msg(
        "Immediate cap changes must strictly reduce at least one cap and cannot increase either"
    )]
    CapReductionRequired,
    #[msg(
        "Proposed MintConfig update must be risk-increasing and advance at most one rollout stage"
    )]
    InvalidMintConfigUpdate,
    #[msg("No MintConfig update is pending")]
    NoPendingMintConfigUpdate,
    #[msg("MintConfig update timelock has not elapsed")]
    MintConfigUpdateNotReady,
    #[msg("Timestamp arithmetic overflowed")]
    TimestampOverflow,
    #[msg("Checked arithmetic overflowed")]
    ArithmeticOverflow,
    #[msg("Custody balance is below the vault's accounted total assets")]
    CustodyShortfall,
    #[msg("Custody contains no recoverable excess")]
    NoExcessToSweep,
    #[msg("Excess recovery requires the vault to be ExitOnly or FullyPaused")]
    ExcessRecoveryRequiresPausedVault,
    #[msg("Treasury account does not match ProtocolConfig")]
    InvalidTreasury,
}

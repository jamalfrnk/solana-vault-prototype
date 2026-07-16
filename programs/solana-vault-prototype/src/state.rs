use anchor_lang::prelude::*;

pub const VAULT_STATE_VERSION_V0: u8 = 0;
pub const VAULT_STATE_VERSION_V1: u8 = 1;
pub const PROTOCOL_CONFIG_VERSION_V1: u8 = 1;

/// Borsh encodes these unit variants as their zero-based one-byte indexes,
/// exactly matching the legacy bool byte for Active (0) and ExitOnly (1).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
#[repr(u8)]
pub enum OperationalState {
    Active,
    ExitOnly,
    FullyPaused,
}

impl OperationalState {
    pub const fn allows_deposits(self) -> bool {
        matches!(self, Self::Active)
    }

    pub const fn allows_withdrawals(self) -> bool {
        matches!(self, Self::Active | Self::ExitOnly)
    }
}

/// Bounded machine-readable evidence for an Active/ExitOnly transition.
/// Arbitrary incident narratives stay in the off-chain incident record.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
#[repr(u8)]
pub enum OperationalStateReason {
    IncidentResponse,
    ExposureReduction,
    IncidentResolved,
    GovernanceAction,
}

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub pause_authority: Pubkey,
    pub mint: Pubkey,
    pub vault_bump: u8,
    pub authority_bump: u8,
    pub total_assets: u64,
    pub total_shares: u64,
    pub operational_state: OperationalState,
    /// Two-step rotation (M18): the proposed next pause authority, or
    /// `Pubkey::default()` when no rotation is pending. This remains after the
    /// operational-state byte so every earlier field keeps its byte offset.
    pub pending_pause_authority: Pubkey,
    /// Explicit same-size schema version (M21). Version 0 is the M18 layout;
    /// version 1 is the first production-target layout.
    pub version: u8,
    pub reserved: [u8; 21],
}

impl VaultState {
    pub const ACCOUNT_LEN: usize = 8 + Self::INIT_SPACE;
}

/// Singleton protocol-level authority configuration. The exact 200-byte v1
/// layout is frozen by M23; future assignments consume reserved bytes only
/// through a reviewed versioned migration.
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub version: u8,
    pub bump: u8,
    pub protocol_governance_authority: Pubkey,
    pub emergency_authority: Pubkey,
    pub treasury: Pubkey,
    pub token_program: Pubkey,
    pub reserved: [u8; 62],
}

impl ProtocolConfig {
    pub const ACCOUNT_LEN: usize = 8 + Self::INIT_SPACE;
}

const _: () = assert!(ProtocolConfig::ACCOUNT_LEN == 200);

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

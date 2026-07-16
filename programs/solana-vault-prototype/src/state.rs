use anchor_lang::prelude::*;

pub const VAULT_STATE_VERSION_V0: u8 = 0;
pub const VAULT_STATE_VERSION_V1: u8 = 1;

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

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

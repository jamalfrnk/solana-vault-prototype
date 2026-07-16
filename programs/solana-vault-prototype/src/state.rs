use anchor_lang::prelude::*;

pub const VAULT_STATE_VERSION_V0: u8 = 0;
pub const VAULT_STATE_VERSION_V1: u8 = 1;
pub const PROTOCOL_CONFIG_VERSION_V1: u8 = 1;
pub const MINT_CONFIG_VERSION_V1: u8 = 1;

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

/// Ordered staged-exposure labels accepted by ADR 0007. The program enforces
/// one-stage-at-a-time promotion; the deployment manifest remains responsible
/// for mapping reviewed token base-unit caps to the ADR's USD-equivalent ceilings.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
#[repr(u8)]
pub enum RolloutStage {
    Devnet,
    Canary,
    Limited,
    Expanded,
}

impl RolloutStage {
    pub const fn permits_target(self, target: Self) -> bool {
        let current = self as u8;
        let proposed = target as u8;
        proposed >= current && proposed <= current.saturating_add(1)
    }
}

/// Per-mint allowlist and exposure configuration. The exact 160-byte v1
/// layout is frozen by M24. A pending update commits every future value so
/// execution after the delay is permissionless but cannot choose new terms.
#[account]
#[derive(InitSpace)]
pub struct MintConfig {
    pub version: u8,
    pub bump: u8,
    pub mint: Pubkey,
    pub enabled: bool,
    pub max_total_assets: u64,
    pub max_deposit_assets_per_transaction: u64,
    pub rollout_stage: RolloutStage,
    pub has_pending_update: bool,
    pub pending_enabled: bool,
    pub pending_max_total_assets: u64,
    pub pending_max_deposit_assets_per_transaction: u64,
    pub pending_rollout_stage: RolloutStage,
    pub pending_effective_unix_timestamp: i64,
    pub reserved: [u8; 73],
}

impl MintConfig {
    pub const ACCOUNT_LEN: usize = 8 + Self::INIT_SPACE;

    pub fn clear_pending_update(&mut self) {
        self.has_pending_update = false;
        self.pending_enabled = false;
        self.pending_max_total_assets = 0;
        self.pending_max_deposit_assets_per_transaction = 0;
        self.pending_rollout_stage = RolloutStage::Devnet;
        self.pending_effective_unix_timestamp = 0;
    }

    /// Fail closed on malformed pending state. This is checked by every
    /// ordinary consumer, including deposits while a valid proposal waits.
    pub fn pending_state_is_valid(&self) -> bool {
        if !self.has_pending_update {
            return !self.pending_enabled
                && self.pending_max_total_assets == 0
                && self.pending_max_deposit_assets_per_transaction == 0
                && self.pending_rollout_stage == RolloutStage::Devnet
                && self.pending_effective_unix_timestamp == 0;
        }

        self.pending_enabled
            && self.pending_effective_unix_timestamp > 0
            && self.pending_max_deposit_assets_per_transaction <= self.pending_max_total_assets
            && self.pending_max_total_assets >= self.max_total_assets
            && self.pending_max_deposit_assets_per_transaction
                >= self.max_deposit_assets_per_transaction
            && self
                .rollout_stage
                .permits_target(self.pending_rollout_stage)
            && (!self.enabled
                || self.pending_max_total_assets > self.max_total_assets
                || self.pending_max_deposit_assets_per_transaction
                    > self.max_deposit_assets_per_transaction
                || self.pending_rollout_stage != self.rollout_stage)
    }
}

const _: () = assert!(MintConfig::ACCOUNT_LEN == 160);

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

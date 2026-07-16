use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub mint: Pubkey,
    pub pause_authority: Pubkey,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub shares_out: u64,
    pub total_assets: u64,
    pub total_shares: u64,
}

#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub assets_out: u64,
    pub shares_in: u64,
    pub total_assets: u64,
    pub total_shares: u64,
}

#[event]
pub struct OperationalStateChanged {
    pub vault: Pubkey,
    pub previous_state: u8,
    pub new_state: u8,
    pub authority: Pubkey,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub reason_code: u8,
}

#[event]
pub struct PauseAuthorityProposed {
    pub vault: Pubkey,
    pub current_authority: Pubkey,
    pub proposed_authority: Pubkey,
}

#[event]
pub struct PauseAuthorityRotated {
    pub vault: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct VaultStateMigrated {
    pub vault: Pubkey,
    pub old_version: u8,
    pub new_version: u8,
    pub operational_state: u8,
}

#[event]
pub struct ProtocolConfigInitialized {
    pub protocol_config: Pubkey,
    pub initializer: Pubkey,
    pub protocol_governance_authority: Pubkey,
    pub emergency_authority: Pubkey,
    pub treasury: Pubkey,
    pub token_program: Pubkey,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub version: u8,
}

#[event]
pub struct MintConfigInitialized {
    pub mint_config: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub enabled: bool,
    pub max_total_assets: u64,
    pub max_deposit_assets_per_transaction: u64,
    pub rollout_stage: u8,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub version: u8,
}

#[event]
pub struct MintConfigUpdateProposed {
    pub mint_config: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub previous_enabled: bool,
    pub previous_max_total_assets: u64,
    pub previous_max_deposit_assets_per_transaction: u64,
    pub previous_rollout_stage: u8,
    pub proposed_enabled: bool,
    pub proposed_max_total_assets: u64,
    pub proposed_max_deposit_assets_per_transaction: u64,
    pub proposed_rollout_stage: u8,
    pub effective_unix_timestamp: i64,
    pub slot: u64,
    pub unix_timestamp: i64,
}

#[event]
pub struct MintConfigChanged {
    pub mint_config: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub previous_enabled: bool,
    pub previous_max_total_assets: u64,
    pub previous_max_deposit_assets_per_transaction: u64,
    pub previous_rollout_stage: u8,
    pub new_enabled: bool,
    pub new_max_total_assets: u64,
    pub new_max_deposit_assets_per_transaction: u64,
    pub new_rollout_stage: u8,
    pub slot: u64,
    pub unix_timestamp: i64,
    /// 0 = immediate cap reduction, 1 = immediate disable, 2 = timelocked update.
    pub change_kind: u8,
}

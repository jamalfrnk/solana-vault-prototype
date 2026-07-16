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

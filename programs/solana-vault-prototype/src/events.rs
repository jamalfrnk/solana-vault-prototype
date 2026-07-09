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
pub struct Paused {
    pub vault: Pubkey,
    pub pause_authority: Pubkey,
}

#[event]
pub struct Unpaused {
    pub vault: Pubkey,
    pub pause_authority: Pubkey,
}

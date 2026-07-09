use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub pause_authority: Pubkey,
    pub mint: Pubkey,
    pub vault_bump: u8,
    pub authority_bump: u8,
    pub total_assets: u64,
    pub total_shares: u64,
    pub is_paused: bool,
    pub reserved: [u8; 22],
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

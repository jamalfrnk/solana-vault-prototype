use anchor_lang::prelude::*;

#[account]
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

impl VaultState {
    // 8 discriminator + 32 pause_authority + 32 mint + 1 vault_bump + 1 authority_bump
    // + 8 total_assets + 8 total_shares + 1 is_paused + 22 reserved = 113
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1 + 22;
}

#[account]
pub struct UserPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

impl UserPosition {
    // 8 discriminator + 32 owner + 32 vault + 8 shares + 1 bump = 81
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1;
}

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
    /// Two-step rotation (M18): the proposed next pause authority, or
    /// `Pubkey::default()` when no rotation is pending. Appended AFTER
    /// `is_paused` so every pre-M18 field keeps its byte offset — but note
    /// this still grows the account: vaults initialized under the pre-M18
    /// layout are NOT compatible with this program version (accepted for a
    /// devnet prototype; documented in ARCHITECTURE.md).
    pub pending_pause_authority: Pubkey,
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

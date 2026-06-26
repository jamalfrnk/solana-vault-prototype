use anchor_lang::prelude::*;

use crate::{
    constants::VAULT_SEED,
    error::VaultError,
    state::VaultState,
};

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        constraint = pause_authority.key() == vault_state.pause_authority @ VaultError::Unauthorized,
    )]
    pub pause_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.vault_state.is_paused = true;
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        constraint = pause_authority.key() == vault_state.pause_authority @ VaultError::Unauthorized,
    )]
    pub pause_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    ctx.accounts.vault_state.is_paused = false;
    Ok(())
}

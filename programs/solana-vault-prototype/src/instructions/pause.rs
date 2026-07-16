use anchor_lang::prelude::*;

use crate::{
    constants::VAULT_SEED,
    error::VaultError,
    events::{Paused, Unpaused},
    state::{OperationalState, VaultState, VAULT_STATE_VERSION_V1},
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
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.vault_state.operational_state = OperationalState::ExitOnly;

    emit!(Paused {
        vault: ctx.accounts.vault_state.key(),
        pause_authority: ctx.accounts.pause_authority.key(),
    });

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
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    ctx.accounts.vault_state.operational_state = OperationalState::Active;

    emit!(Unpaused {
        vault: ctx.accounts.vault_state.key(),
        pause_authority: ctx.accounts.pause_authority.key(),
    });

    Ok(())
}

use anchor_lang::prelude::*;

use crate::{
    constants::VAULT_SEED,
    error::VaultError,
    events::OperationalStateChanged,
    state::{OperationalState, OperationalStateReason, VaultState, VAULT_STATE_VERSION_V1},
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

pub fn pause_handler(ctx: Context<Pause>, reason: OperationalStateReason) -> Result<()> {
    let clock = Clock::get()?;
    let vault_state = &mut ctx.accounts.vault_state;
    let previous_state = vault_state.operational_state;
    require!(
        previous_state != OperationalState::FullyPaused,
        VaultError::InvalidOperationalStateTransition
    );
    vault_state.operational_state = OperationalState::ExitOnly;

    emit!(OperationalStateChanged {
        vault: vault_state.key(),
        previous_state: previous_state as u8,
        new_state: OperationalState::ExitOnly as u8,
        authority: ctx.accounts.pause_authority.key(),
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
        reason_code: reason as u8,
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

pub fn unpause_handler(ctx: Context<Unpause>, reason: OperationalStateReason) -> Result<()> {
    let clock = Clock::get()?;
    let vault_state = &mut ctx.accounts.vault_state;
    let previous_state = vault_state.operational_state;
    require!(
        previous_state != OperationalState::FullyPaused,
        VaultError::InvalidOperationalStateTransition
    );
    vault_state.operational_state = OperationalState::Active;

    emit!(OperationalStateChanged {
        vault: vault_state.key(),
        previous_state: previous_state as u8,
        new_state: OperationalState::Active as u8,
        authority: ctx.accounts.pause_authority.key(),
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
        reason_code: reason as u8,
    });

    Ok(())
}

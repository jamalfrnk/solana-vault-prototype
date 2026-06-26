use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::{VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    state::VaultState,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = pause_authority.key() != payer.key() @ VaultError::Unauthorized,
    )]
    pub pause_authority: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = VaultState::LEN,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: PDA that owns the custody ATA; authority validated by seeds
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault_state.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub custody: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let vs = &mut ctx.accounts.vault_state;
    vs.pause_authority = ctx.accounts.pause_authority.key();
    vs.mint = ctx.accounts.mint.key();
    vs.vault_bump = ctx.bumps.vault_state;
    vs.authority_bump = ctx.bumps.vault_authority;
    vs.total_assets = 0;
    vs.total_shares = 0;
    vs.is_paused = false;
    vs.reserved = [0u8; 22];
    Ok(())
}

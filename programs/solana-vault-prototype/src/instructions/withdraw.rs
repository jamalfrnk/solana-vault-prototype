use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{USER_POSITION_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    state::{UserPosition, VaultState},
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = !vault_state.is_paused @ VaultError::VaultPaused,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: PDA signer for outbound transfer; seeds + bump verified.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault_state.key().as_ref()],
        bump = vault_state.authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub custody: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == vault_state.mint @ VaultError::MintMismatch,
        constraint = user_token_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, vault_state.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ VaultError::Unauthorized,
        constraint = user_position.vault == vault_state.key() @ VaultError::MintMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Withdraw>, shares_in: u64) -> Result<()> {
    require!(shares_in > 0, VaultError::ZeroAmount);

    let vs = &ctx.accounts.vault_state;
    require!(shares_in <= ctx.accounts.user_position.shares, VaultError::InsufficientShares);

    // Asset redemption: floor(shares_in * total_assets / total_shares)
    let assets_out: u64 = {
        let numerator = (shares_in as u128)
            .checked_mul(vs.total_assets as u128)
            .ok_or(VaultError::ZeroDenominator)?;
        let result = numerator
            .checked_div(vs.total_shares as u128)
            .ok_or(VaultError::ZeroDenominator)?;
        u64::try_from(result).map_err(|_| error!(VaultError::ZeroDenominator))?
    };

    require!(assets_out > 0, VaultError::ZeroAmount);

    // PDA-signed CPI: custody → user_token_account
    let vault_state_key = ctx.accounts.vault_state.key();
    let authority_bump = ctx.accounts.vault_state.authority_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        VAULT_AUTHORITY_SEED,
        vault_state_key.as_ref(),
        &[authority_bump],
    ]];

    let cpi_ctx = CpiContext::new_with_signer(
        anchor_spl::token::ID,
        TransferChecked {
            from: ctx.accounts.custody.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(cpi_ctx, assets_out, ctx.accounts.mint.decimals)?;

    // Update vault accounting.
    let vs = &mut ctx.accounts.vault_state;
    vs.total_assets = vs.total_assets.checked_sub(assets_out).ok_or(VaultError::ZeroDenominator)?;
    vs.total_shares = vs.total_shares.checked_sub(shares_in).ok_or(VaultError::ZeroDenominator)?;

    // Update user position.
    ctx.accounts.user_position.shares = ctx.accounts.user_position.shares
        .checked_sub(shares_in)
        .ok_or(VaultError::InsufficientShares)?;

    Ok(())
}

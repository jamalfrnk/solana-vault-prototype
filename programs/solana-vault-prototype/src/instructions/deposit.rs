use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{USER_POSITION_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    state::{UserPosition, VaultState},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = !vault_state.is_paused @ VaultError::VaultPaused,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: PDA that owns the custody ATA; authority validated by seeds + bump.
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
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [USER_POSITION_SEED, vault_state.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);

    let vs = &ctx.accounts.vault_state;

    // Share issuance: 1:1 on first deposit; proportional thereafter.
    let shares_out: u64 = if vs.total_shares == 0 {
        amount
    } else {
        let numerator = (amount as u128)
            .checked_mul(vs.total_shares as u128)
            .ok_or(VaultError::ZeroDenominator)?;
        let shares = numerator
            .checked_div(vs.total_assets as u128)
            .ok_or(VaultError::ZeroDenominator)?;
        u64::try_from(shares).map_err(|_| error!(VaultError::ZeroDenominator))?
    };

    require!(shares_out > 0, VaultError::ZeroAmount);

    // CPI: transfer tokens from user into custody.
    // Anchor 1.0.x CpiContext::new takes (Pubkey, Accounts) — use the constant.
    let cpi_ctx = CpiContext::new(
        anchor_spl::token::ID,
        TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.custody.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    // Update vault accounting.
    let vs = &mut ctx.accounts.vault_state;
    vs.total_assets = vs.total_assets.checked_add(amount).ok_or(VaultError::ZeroDenominator)?;
    vs.total_shares = vs.total_shares.checked_add(shares_out).ok_or(VaultError::ZeroDenominator)?;

    // Update (or initialise) user position.
    let up = &mut ctx.accounts.user_position;
    if up.owner == Pubkey::default() {
        up.owner = ctx.accounts.user.key();
        up.vault = ctx.accounts.vault_state.key();
        up.bump = ctx.bumps.user_position;
    }
    up.shares = up.shares.checked_add(shares_out).ok_or(VaultError::ZeroDenominator)?;

    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{MINT_CONFIG_SEED, USER_POSITION_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    events::Deposited,
    state::{MintConfig, UserPosition, VaultState, MINT_CONFIG_VERSION_V1, VAULT_STATE_VERSION_V1},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
        constraint = vault_state.operational_state.allows_deposits()
            @ VaultError::VaultPaused,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: PDA that owns the custody ATA; authority validated by seeds + bump + owner.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault_state.key().as_ref()],
        bump = vault_state.authority_bump,
        owner = System::id() @ VaultError::InvalidVaultAuthorityOwner,
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
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [USER_POSITION_SEED, vault_state.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    #[account(
        seeds = [MINT_CONFIG_SEED, vault_state.mint.as_ref()],
        bump = mint_config.bump,
        constraint = mint_config.version == MINT_CONFIG_VERSION_V1
            @ VaultError::UnsupportedMintConfigVersion,
        constraint = mint_config.mint == vault_state.mint @ VaultError::InvalidMintConfigMint,
        constraint = mint_config.enabled @ VaultError::MintDisabled,
        constraint = mint_config.reserved.iter().all(|byte| *byte == 0)
            @ VaultError::InvalidMintConfigReservedBytes,
        constraint = mint_config.pending_state_is_valid()
            @ VaultError::InvalidMintConfigPendingState,
    )]
    pub mint_config: Box<Account<'info, MintConfig>>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);

    let vs = &ctx.accounts.vault_state;
    let mint_config = &ctx.accounts.mint_config;
    require!(
        amount <= mint_config.max_deposit_assets_per_transaction,
        VaultError::DepositCapExceeded
    );
    let new_total_assets = vs
        .total_assets
        .checked_add(amount)
        .ok_or(VaultError::ArithmeticOverflow)?;
    require!(
        new_total_assets <= mint_config.max_total_assets,
        VaultError::MaxTotalAssetsExceeded
    );

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
    vs.total_assets = new_total_assets;
    vs.total_shares = vs
        .total_shares
        .checked_add(shares_out)
        .ok_or(VaultError::ZeroDenominator)?;

    // Update (or initialise) user position.
    let up = &mut ctx.accounts.user_position;
    if up.owner == Pubkey::default() {
        up.owner = ctx.accounts.user.key();
        up.vault = ctx.accounts.vault_state.key();
        up.bump = ctx.bumps.user_position;
    }
    up.shares = up
        .shares
        .checked_add(shares_out)
        .ok_or(VaultError::ZeroDenominator)?;

    emit!(Deposited {
        vault: ctx.accounts.vault_state.key(),
        user: ctx.accounts.user.key(),
        amount,
        shares_out,
        total_assets: ctx.accounts.vault_state.total_assets,
        total_shares: ctx.accounts.vault_state.total_shares,
    });

    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{PROTOCOL_CONFIG_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    events::ExcessSwept,
    state::{
        OperationalState, ProtocolConfig, VaultState, PROTOCOL_CONFIG_VERSION_V1,
        VAULT_STATE_VERSION_V1,
    },
};

/// ADR 0008 recovery surface. No amount or destination is caller-selected:
/// the program computes the complete excess and the treasury ATA is canonical.
#[derive(Accounts)]
pub struct SweepExcess<'info> {
    #[account(
        constraint = protocol_governance_authority.key()
            == protocol_config.protocol_governance_authority @ VaultError::Unauthorized,
    )]
    pub protocol_governance_authority: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump,
        constraint = protocol_config.version == PROTOCOL_CONFIG_VERSION_V1
            @ VaultError::UnsupportedProtocolConfigVersion,
        constraint = protocol_config.reserved.iter().all(|byte| *byte == 0)
            @ VaultError::InvalidProtocolConfigReservedBytes,
        constraint = protocol_config.token_program == anchor_spl::token::ID
            @ VaultError::InvalidProtocolTokenProgram,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
        constraint = matches!(
            vault_state.operational_state,
            OperationalState::ExitOnly | OperationalState::FullyPaused
        ) @ VaultError::ExcessRecoveryRequiresPausedVault,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: existing PDA signer; seeds, bump, and System ownership are verified.
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

    /// CHECK: deterministic destination owner; equality to ProtocolConfig is verified.
    #[account(
        address = protocol_config.treasury @ VaultError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    #[account(address = vault_state.mint @ VaultError::MintMismatch)]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SweepExcess>) -> Result<()> {
    let total_assets = ctx.accounts.vault_state.total_assets;
    let excess = ctx
        .accounts
        .custody
        .amount
        .checked_sub(total_assets)
        .ok_or(VaultError::CustodyShortfall)?;
    require!(excess > 0, VaultError::NoExcessToSweep);

    ctx.accounts
        .treasury_token_account
        .amount
        .checked_add(excess)
        .ok_or(VaultError::ArithmeticOverflow)?;

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
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(cpi_ctx, excess, ctx.accounts.mint.decimals)?;

    // Anchor token-account views are not refreshed by CPI automatically. Reload so
    // event evidence reports the observed post-transfer custody balance.
    ctx.accounts.custody.reload()?;
    let clock = Clock::get()?;
    emit!(ExcessSwept {
        vault: vault_state_key,
        mint: ctx.accounts.mint.key(),
        treasury: ctx.accounts.treasury.key(),
        authority: ctx.accounts.protocol_governance_authority.key(),
        amount: excess,
        custody_balance: ctx.accounts.custody.amount,
        total_assets,
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
    });

    Ok(())
}

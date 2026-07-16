use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::{MINT_CONFIG_SEED, PROTOCOL_CONFIG_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    events::VaultInitialized,
    state::{
        MintConfig, OperationalState, ProtocolConfig, VaultState, MINT_CONFIG_VERSION_V1,
        PROTOCOL_CONFIG_VERSION_V1, VAULT_STATE_VERSION_V1,
    },
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = pause_authority.key() != payer.key() @ VaultError::Unauthorized,
    )]
    pub pause_authority: Signer<'info>,

    #[account(
        constraint = mint.mint_authority.is_none() @ VaultError::MintAuthorityPresent,
        constraint = mint.freeze_authority.is_none() @ VaultError::FreezeAuthorityPresent,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + VaultState::INIT_SPACE,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// CHECK: PDA that owns the custody ATA; authority validated by seeds + owner
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault_state.key().as_ref()],
        bump,
        owner = System::id() @ VaultError::InvalidVaultAuthorityOwner,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub custody: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

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
        seeds = [MINT_CONFIG_SEED, mint.key().as_ref()],
        bump = mint_config.bump,
        constraint = mint_config.version == MINT_CONFIG_VERSION_V1
            @ VaultError::UnsupportedMintConfigVersion,
        constraint = mint_config.mint == mint.key() @ VaultError::InvalidMintConfigMint,
        constraint = mint_config.enabled @ VaultError::MintDisabled,
        constraint = mint_config.reserved.iter().all(|byte| *byte == 0)
            @ VaultError::InvalidMintConfigReservedBytes,
        constraint = mint_config.pending_state_is_valid()
            @ VaultError::InvalidMintConfigPendingState,
    )]
    pub mint_config: Account<'info, MintConfig>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let vs = &mut ctx.accounts.vault_state;
    vs.pause_authority = ctx.accounts.pause_authority.key();
    vs.mint = ctx.accounts.mint.key();
    vs.vault_bump = ctx.bumps.vault_state;
    vs.authority_bump = ctx.bumps.vault_authority;
    vs.total_assets = 0;
    vs.total_shares = 0;
    vs.operational_state = OperationalState::Active;
    vs.pending_pause_authority = Pubkey::default();
    vs.version = VAULT_STATE_VERSION_V1;
    vs.reserved = [0u8; 21];

    emit!(VaultInitialized {
        vault: ctx.accounts.vault_state.key(),
        mint: ctx.accounts.mint.key(),
        pause_authority: ctx.accounts.pause_authority.key(),
    });

    Ok(())
}

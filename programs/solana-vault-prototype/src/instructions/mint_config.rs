use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    constants::{
        MINT_CONFIG_SEED, MINT_CONFIG_UPDATE_DELAY_SECONDS, PROTOCOL_CONFIG_SEED, VAULT_SEED,
    },
    error::VaultError,
    events::{MintConfigChanged, MintConfigInitialized, MintConfigUpdateProposed},
    state::{
        MintConfig, ProtocolConfig, RolloutStage, VaultState, MINT_CONFIG_VERSION_V1,
        PROTOCOL_CONFIG_VERSION_V1, VAULT_STATE_VERSION_V1,
    },
};

#[derive(Accounts)]
pub struct InitializeMintConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

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
        constraint = mint.mint_authority.is_none() @ VaultError::MintAuthorityPresent,
        constraint = mint.freeze_authority.is_none() @ VaultError::FreezeAuthorityPresent,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + MintConfig::INIT_SPACE,
        seeds = [MINT_CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub mint_config: Account<'info, MintConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<InitializeMintConfig>) -> Result<()> {
    let clock = Clock::get()?;
    let config = &mut ctx.accounts.mint_config;
    config.version = MINT_CONFIG_VERSION_V1;
    config.bump = ctx.bumps.mint_config;
    config.mint = ctx.accounts.mint.key();
    config.enabled = false;
    config.max_total_assets = 0;
    config.max_deposit_assets_per_transaction = 0;
    config.rollout_stage = RolloutStage::Devnet;
    config.clear_pending_update();
    config.reserved = [0; 73];

    emit!(MintConfigInitialized {
        mint_config: config.key(),
        mint: config.mint,
        authority: ctx.accounts.protocol_governance_authority.key(),
        enabled: config.enabled,
        max_total_assets: 0,
        max_deposit_assets_per_transaction: 0,
        rollout_stage: config.rollout_stage as u8,
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
        version: MINT_CONFIG_VERSION_V1,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct GovernMintConfig<'info> {
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
        mut,
        seeds = [MINT_CONFIG_SEED, mint_config.mint.as_ref()],
        bump = mint_config.bump,
        constraint = mint_config.version == MINT_CONFIG_VERSION_V1
            @ VaultError::UnsupportedMintConfigVersion,
        constraint = mint_config.reserved.iter().all(|byte| *byte == 0)
            @ VaultError::InvalidMintConfigReservedBytes,
        constraint = mint_config.pending_state_is_valid()
            @ VaultError::InvalidMintConfigPendingState,
    )]
    pub mint_config: Account<'info, MintConfig>,
}

pub fn propose_update_handler(
    ctx: Context<GovernMintConfig>,
    enabled: bool,
    max_total_assets: u64,
    max_deposit_assets_per_transaction: u64,
    rollout_stage: RolloutStage,
) -> Result<()> {
    require_valid_caps(max_total_assets, max_deposit_assets_per_transaction)?;

    let config = &mut ctx.accounts.mint_config;
    let is_increase = (!config.enabled && enabled)
        || max_total_assets > config.max_total_assets
        || max_deposit_assets_per_transaction > config.max_deposit_assets_per_transaction
        || rollout_stage != config.rollout_stage;
    require!(
        enabled
            && max_total_assets >= config.max_total_assets
            && max_deposit_assets_per_transaction >= config.max_deposit_assets_per_transaction
            && config.rollout_stage.permits_target(rollout_stage)
            && is_increase,
        VaultError::InvalidMintConfigUpdate
    );

    let clock = Clock::get()?;
    let effective_unix_timestamp = clock
        .unix_timestamp
        .checked_add(MINT_CONFIG_UPDATE_DELAY_SECONDS)
        .ok_or(VaultError::TimestampOverflow)?;

    config.has_pending_update = true;
    config.pending_enabled = enabled;
    config.pending_max_total_assets = max_total_assets;
    config.pending_max_deposit_assets_per_transaction = max_deposit_assets_per_transaction;
    config.pending_rollout_stage = rollout_stage;
    config.pending_effective_unix_timestamp = effective_unix_timestamp;

    emit!(MintConfigUpdateProposed {
        mint_config: config.key(),
        mint: config.mint,
        authority: ctx.accounts.protocol_governance_authority.key(),
        previous_enabled: config.enabled,
        previous_max_total_assets: config.max_total_assets,
        previous_max_deposit_assets_per_transaction: config.max_deposit_assets_per_transaction,
        previous_rollout_stage: config.rollout_stage as u8,
        proposed_enabled: enabled,
        proposed_max_total_assets: max_total_assets,
        proposed_max_deposit_assets_per_transaction: max_deposit_assets_per_transaction,
        proposed_rollout_stage: rollout_stage as u8,
        effective_unix_timestamp,
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteMintConfigUpdate<'info> {
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
        mut,
        seeds = [MINT_CONFIG_SEED, mint_config.mint.as_ref()],
        bump = mint_config.bump,
        constraint = mint_config.version == MINT_CONFIG_VERSION_V1
            @ VaultError::UnsupportedMintConfigVersion,
        constraint = mint_config.reserved.iter().all(|byte| *byte == 0)
            @ VaultError::InvalidMintConfigReservedBytes,
        constraint = mint_config.pending_state_is_valid()
            @ VaultError::InvalidMintConfigPendingState,
    )]
    pub mint_config: Account<'info, MintConfig>,
}

pub fn execute_update_handler(ctx: Context<ExecuteMintConfigUpdate>) -> Result<()> {
    let clock = Clock::get()?;
    let config = &mut ctx.accounts.mint_config;
    require!(
        config.has_pending_update,
        VaultError::NoPendingMintConfigUpdate
    );
    require!(
        clock.unix_timestamp >= config.pending_effective_unix_timestamp,
        VaultError::MintConfigUpdateNotReady
    );

    let previous_enabled = config.enabled;
    let previous_max_total_assets = config.max_total_assets;
    let previous_max_deposit_assets_per_transaction = config.max_deposit_assets_per_transaction;
    let previous_rollout_stage = config.rollout_stage;

    config.enabled = config.pending_enabled;
    config.max_total_assets = config.pending_max_total_assets;
    config.max_deposit_assets_per_transaction = config.pending_max_deposit_assets_per_transaction;
    config.rollout_stage = config.pending_rollout_stage;
    config.clear_pending_update();

    emit_change(
        config,
        ctx.accounts.protocol_config.protocol_governance_authority,
        previous_enabled,
        previous_max_total_assets,
        previous_max_deposit_assets_per_transaction,
        previous_rollout_stage,
        &clock,
        2,
    );

    Ok(())
}

pub fn disable_handler(ctx: Context<GovernMintConfig>) -> Result<()> {
    let clock = Clock::get()?;
    let config = &mut ctx.accounts.mint_config;
    let previous_enabled = config.enabled;
    let previous_max_total_assets = config.max_total_assets;
    let previous_max_deposit_assets_per_transaction = config.max_deposit_assets_per_transaction;
    let previous_rollout_stage = config.rollout_stage;

    config.enabled = false;
    config.clear_pending_update();

    emit_change(
        config,
        ctx.accounts.protocol_governance_authority.key(),
        previous_enabled,
        previous_max_total_assets,
        previous_max_deposit_assets_per_transaction,
        previous_rollout_stage,
        &clock,
        1,
    );

    Ok(())
}

#[derive(Accounts)]
pub struct LowerMintCaps<'info> {
    #[account(
        constraint = pause_authority.key() == vault_state.pause_authority
            @ VaultError::Unauthorized,
    )]
    pub pause_authority: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [MINT_CONFIG_SEED, mint_config.mint.as_ref()],
        bump = mint_config.bump,
        constraint = mint_config.version == MINT_CONFIG_VERSION_V1
            @ VaultError::UnsupportedMintConfigVersion,
        constraint = mint_config.mint == vault_state.mint @ VaultError::InvalidMintConfigMint,
        constraint = mint_config.reserved.iter().all(|byte| *byte == 0)
            @ VaultError::InvalidMintConfigReservedBytes,
        constraint = mint_config.pending_state_is_valid()
            @ VaultError::InvalidMintConfigPendingState,
    )]
    pub mint_config: Account<'info, MintConfig>,
}

pub fn lower_caps_handler(
    ctx: Context<LowerMintCaps>,
    max_total_assets: u64,
    max_deposit_assets_per_transaction: u64,
) -> Result<()> {
    require_valid_caps(max_total_assets, max_deposit_assets_per_transaction)?;

    let config = &mut ctx.accounts.mint_config;
    require!(
        max_total_assets <= config.max_total_assets
            && max_deposit_assets_per_transaction <= config.max_deposit_assets_per_transaction
            && (max_total_assets < config.max_total_assets
                || max_deposit_assets_per_transaction < config.max_deposit_assets_per_transaction),
        VaultError::CapReductionRequired
    );

    let clock = Clock::get()?;
    let previous_enabled = config.enabled;
    let previous_max_total_assets = config.max_total_assets;
    let previous_max_deposit_assets_per_transaction = config.max_deposit_assets_per_transaction;
    let previous_rollout_stage = config.rollout_stage;

    config.max_total_assets = max_total_assets;
    config.max_deposit_assets_per_transaction = max_deposit_assets_per_transaction;
    config.clear_pending_update();

    emit_change(
        config,
        ctx.accounts.pause_authority.key(),
        previous_enabled,
        previous_max_total_assets,
        previous_max_deposit_assets_per_transaction,
        previous_rollout_stage,
        &clock,
        0,
    );

    Ok(())
}

fn require_valid_caps(
    max_total_assets: u64,
    max_deposit_assets_per_transaction: u64,
) -> Result<()> {
    require!(
        max_deposit_assets_per_transaction <= max_total_assets,
        VaultError::InvalidMintCaps
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn emit_change(
    config: &Account<'_, MintConfig>,
    authority: Pubkey,
    previous_enabled: bool,
    previous_max_total_assets: u64,
    previous_max_deposit_assets_per_transaction: u64,
    previous_rollout_stage: RolloutStage,
    clock: &Clock,
    change_kind: u8,
) {
    emit!(MintConfigChanged {
        mint_config: config.key(),
        mint: config.mint,
        authority,
        previous_enabled,
        previous_max_total_assets,
        previous_max_deposit_assets_per_transaction,
        previous_rollout_stage: previous_rollout_stage as u8,
        new_enabled: config.enabled,
        new_max_total_assets: config.max_total_assets,
        new_max_deposit_assets_per_transaction: config.max_deposit_assets_per_transaction,
        new_rollout_stage: config.rollout_stage as u8,
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
        change_kind,
    });
}

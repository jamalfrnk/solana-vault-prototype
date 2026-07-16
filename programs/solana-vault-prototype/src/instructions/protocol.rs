use anchor_lang::prelude::*;

use crate::{
    constants::{PROTOCOL_CONFIG_SEED, VAULT_SEED},
    error::VaultError,
    events::{OperationalStateChanged, ProtocolConfigInitialized},
    state::{
        OperationalState, OperationalStateReason, ProtocolConfig, VaultState,
        PROTOCOL_CONFIG_VERSION_V1, VAULT_STATE_VERSION_V1,
    },
};

/// One-time singleton bootstrap. The live program's current upgrade authority
/// must sign, preventing a first-caller takeover of the ProtocolConfig PDA.
#[derive(Accounts)]
pub struct InitializeProtocolConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub upgrade_authority: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        address = crate::ID,
        constraint = program.programdata_address()? == Some(program_data.key())
            @ VaultError::InvalidProgramData,
    )]
    pub program: Program<'info>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(upgrade_authority.key())
            @ VaultError::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<InitializeProtocolConfig>,
    protocol_governance_authority: Pubkey,
    emergency_authority: Pubkey,
    treasury: Pubkey,
) -> Result<()> {
    for role in [protocol_governance_authority, emergency_authority, treasury] {
        require!(role != Pubkey::default(), VaultError::InvalidProtocolRole);
    }
    require!(
        protocol_governance_authority != emergency_authority
            && protocol_governance_authority != treasury
            && emergency_authority != treasury,
        VaultError::DuplicateProtocolRole
    );

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.protocol_config;
    config.version = PROTOCOL_CONFIG_VERSION_V1;
    config.bump = ctx.bumps.protocol_config;
    config.protocol_governance_authority = protocol_governance_authority;
    config.emergency_authority = emergency_authority;
    config.treasury = treasury;
    config.token_program = anchor_spl::token::ID;
    config.reserved = [0; 62];

    emit!(ProtocolConfigInitialized {
        protocol_config: config.key(),
        initializer: ctx.accounts.upgrade_authority.key(),
        protocol_governance_authority,
        emergency_authority,
        treasury,
        token_program: anchor_spl::token::ID,
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
        version: PROTOCOL_CONFIG_VERSION_V1,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct EmergencyControl<'info> {
    #[account(
        constraint = emergency_authority.key() == protocol_config.emergency_authority
            @ VaultError::Unauthorized,
    )]
    pub emergency_authority: Signer<'info>,

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
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn emergency_pause_handler(
    ctx: Context<EmergencyControl>,
    reason: OperationalStateReason,
) -> Result<()> {
    transition(
        &mut ctx.accounts.vault_state,
        ctx.accounts.emergency_authority.key(),
        OperationalState::FullyPaused,
        reason,
    )
}

pub fn emergency_resume_handler(
    ctx: Context<EmergencyControl>,
    reason: OperationalStateReason,
) -> Result<()> {
    require!(
        matches!(
            ctx.accounts.vault_state.operational_state,
            OperationalState::FullyPaused | OperationalState::ExitOnly
        ),
        VaultError::InvalidEmergencyStateTransition
    );
    transition(
        &mut ctx.accounts.vault_state,
        ctx.accounts.emergency_authority.key(),
        OperationalState::ExitOnly,
        reason,
    )
}

fn transition(
    vault_state: &mut Account<'_, VaultState>,
    authority: Pubkey,
    new_state: OperationalState,
    reason: OperationalStateReason,
) -> Result<()> {
    let clock = Clock::get()?;
    let previous_state = vault_state.operational_state;
    vault_state.operational_state = new_state;

    emit!(OperationalStateChanged {
        vault: vault_state.key(),
        previous_state: previous_state as u8,
        new_state: new_state as u8,
        authority,
        slot: clock.slot,
        unix_timestamp: clock.unix_timestamp,
        reason_code: reason as u8,
    });

    Ok(())
}

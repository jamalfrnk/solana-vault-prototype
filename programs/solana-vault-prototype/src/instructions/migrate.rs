use anchor_lang::prelude::*;

use crate::{
    constants::{VAULT_AUTHORITY_SEED, VAULT_SEED},
    error::VaultError,
    events::VaultStateMigrated,
    state::{OperationalState, VaultState, VAULT_STATE_VERSION_V0, VAULT_STATE_VERSION_V1},
};

/// Permissionless, same-size v0-to-v1 migration. The instruction accepts no
/// caller-selected values, reallocates nothing, and moves no lamports or tokens.
#[derive(Accounts)]
pub struct MigrateV0ToV1<'info> {
    #[account(
        mut,
        constraint = vault_state.to_account_info().data_len() == VaultState::ACCOUNT_LEN
            @ VaultError::InvalidVaultStateSize,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn handler(ctx: Context<MigrateV0ToV1>) -> Result<()> {
    let vault_key = ctx.accounts.vault_state.key();
    let vault_state = &ctx.accounts.vault_state;

    match vault_state.version {
        VAULT_STATE_VERSION_V0 => {}
        VAULT_STATE_VERSION_V1 => return err!(VaultError::VaultStateAlreadyMigrated),
        _ => return err!(VaultError::UnsupportedVaultVersion),
    }

    let (expected_vault, expected_vault_bump) =
        Pubkey::find_program_address(&[VAULT_SEED, vault_state.mint.as_ref()], ctx.program_id);
    require_keys_eq!(vault_key, expected_vault, VaultError::InvalidVaultStatePda);
    require_eq!(
        vault_state.vault_bump,
        expected_vault_bump,
        VaultError::InvalidVaultBump
    );

    let (_, expected_authority_bump) =
        Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, vault_key.as_ref()], ctx.program_id);
    require_eq!(
        vault_state.authority_bump,
        expected_authority_bump,
        VaultError::InvalidAuthorityBump
    );

    require!(
        matches!(
            vault_state.operational_state,
            OperationalState::Active | OperationalState::ExitOnly
        ),
        VaultError::InvalidLegacyOperationalState
    );
    require!(
        vault_state.reserved.iter().all(|byte| *byte == 0),
        VaultError::InvalidLegacyReservedBytes
    );

    let vault_state = &mut ctx.accounts.vault_state;
    vault_state.version = VAULT_STATE_VERSION_V1;

    emit!(VaultStateMigrated {
        vault: vault_key,
        old_version: VAULT_STATE_VERSION_V0,
        new_version: VAULT_STATE_VERSION_V1,
        operational_state: vault_state.operational_state as u8,
    });

    Ok(())
}

use anchor_lang::prelude::*;

use crate::{
    constants::VAULT_SEED,
    error::VaultError,
    events::{PauseAuthorityProposed, PauseAuthorityRotated},
    state::{VaultState, VAULT_STATE_VERSION_V1},
};

/// Two-step pause-authority rotation (M18).
///
/// Step 1 — `propose_pause_authority(new_authority)`: only the CURRENT
/// authority may propose. The proposal is recorded, nothing changes yet.
/// Re-proposing overwrites any pending proposal; proposing the current
/// authority (then accepting as it) is the supported cancel path.
///
/// Step 2 — `accept_pause_authority`: only the PROPOSED authority may accept,
/// and it must sign — proving the destination key is live before it holds
/// the only pause power. Like every authority check in this program, both
/// signers are `Signer` + key equality with no on-curve assumption, so a
/// multisig vault PDA can be proposed and can accept via its program's
/// `invoke_signed` (see the M16 governance notes) — an existing keypair-run
/// vault can rotate INTO governance without redeploying.

#[derive(Accounts)]
pub struct ProposePauseAuthority<'info> {
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

pub fn propose_handler(ctx: Context<ProposePauseAuthority>, new_authority: Pubkey) -> Result<()> {
    require!(
        new_authority != Pubkey::default(),
        VaultError::InvalidNewAuthority
    );

    let vs = &mut ctx.accounts.vault_state;
    vs.pending_pause_authority = new_authority;

    emit!(PauseAuthorityProposed {
        vault: vs.key(),
        current_authority: ctx.accounts.pause_authority.key(),
        proposed_authority: new_authority,
    });

    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct AcceptPauseAuthority<'info> {
    #[account(
        constraint = vault_state.pending_pause_authority != Pubkey::default()
            @ VaultError::NoPendingAuthority,
        constraint = new_pause_authority.key() == vault_state.pending_pause_authority
            @ VaultError::Unauthorized,
    )]
    pub new_pause_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.mint.as_ref()],
        bump = vault_state.vault_bump,
        constraint = vault_state.version == VAULT_STATE_VERSION_V1
            @ VaultError::UnsupportedVaultVersion,
    )]
    pub vault_state: Account<'info, VaultState>,
}

pub fn accept_handler(ctx: Context<AcceptPauseAuthority>) -> Result<()> {
    let vs = &mut ctx.accounts.vault_state;
    let old_authority = vs.pause_authority;

    vs.pause_authority = ctx.accounts.new_pause_authority.key();
    vs.pending_pause_authority = Pubkey::default();

    emit!(PauseAuthorityRotated {
        vault: vs.key(),
        old_authority,
        new_authority: ctx.accounts.new_pause_authority.key(),
    });

    Ok(())
}

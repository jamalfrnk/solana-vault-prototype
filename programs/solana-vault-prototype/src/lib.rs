// Anchor 1.0.2's #[program] macro expansion itself trips this lint on current
// clippy; a crate-level allow is required because the macro does not forward
// item-level attributes into its generated code. Fixed upstream for the
// unreleased v1.1.0 (otter-sec/anchor#4389, PR #4403). Not a vault code issue.
#![allow(clippy::diverging_sub_expression)]

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq");

#[program]
pub mod solana_vault_prototype {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares_in: u64) -> Result<()> {
        withdraw::handler(ctx, shares_in)
    }

    pub fn pause(ctx: Context<Pause>, reason: OperationalStateReason) -> Result<()> {
        pause::pause_handler(ctx, reason)
    }

    pub fn unpause(ctx: Context<Unpause>, reason: OperationalStateReason) -> Result<()> {
        pause::unpause_handler(ctx, reason)
    }

    pub fn propose_pause_authority(
        ctx: Context<ProposePauseAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        rotate::propose_handler(ctx, new_authority)
    }

    pub fn accept_pause_authority(ctx: Context<AcceptPauseAuthority>) -> Result<()> {
        rotate::accept_handler(ctx)
    }

    pub fn migrate_v0_to_v1(ctx: Context<MigrateV0ToV1>) -> Result<()> {
        migrate::handler(ctx)
    }
}

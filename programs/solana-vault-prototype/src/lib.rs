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

declare_id!("HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS");

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

    pub fn initialize_protocol_config(
        ctx: Context<InitializeProtocolConfig>,
        protocol_governance_authority: Pubkey,
        emergency_authority: Pubkey,
        treasury: Pubkey,
    ) -> Result<()> {
        protocol::initialize_handler(
            ctx,
            protocol_governance_authority,
            emergency_authority,
            treasury,
        )
    }

    pub fn emergency_pause(
        ctx: Context<EmergencyControl>,
        reason: OperationalStateReason,
    ) -> Result<()> {
        protocol::emergency_pause_handler(ctx, reason)
    }

    pub fn emergency_resume(
        ctx: Context<EmergencyControl>,
        reason: OperationalStateReason,
    ) -> Result<()> {
        protocol::emergency_resume_handler(ctx, reason)
    }

    pub fn initialize_mint_config(ctx: Context<InitializeMintConfig>) -> Result<()> {
        mint_config::initialize_handler(ctx)
    }

    pub fn propose_mint_config_update(
        ctx: Context<GovernMintConfig>,
        enabled: bool,
        max_total_assets: u64,
        max_deposit_assets_per_transaction: u64,
        rollout_stage: RolloutStage,
    ) -> Result<()> {
        mint_config::propose_update_handler(
            ctx,
            enabled,
            max_total_assets,
            max_deposit_assets_per_transaction,
            rollout_stage,
        )
    }

    pub fn execute_mint_config_update(ctx: Context<ExecuteMintConfigUpdate>) -> Result<()> {
        mint_config::execute_update_handler(ctx)
    }

    pub fn disable_mint(ctx: Context<GovernMintConfig>) -> Result<()> {
        mint_config::disable_handler(ctx)
    }

    pub fn lower_mint_caps(
        ctx: Context<LowerMintCaps>,
        max_total_assets: u64,
        max_deposit_assets_per_transaction: u64,
    ) -> Result<()> {
        mint_config::lower_caps_handler(ctx, max_total_assets, max_deposit_assets_per_transaction)
    }

    pub fn sweep_excess(ctx: Context<SweepExcess>) -> Result<()> {
        excess::handler(ctx)
    }
}

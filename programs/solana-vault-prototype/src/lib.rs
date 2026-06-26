pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
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
}

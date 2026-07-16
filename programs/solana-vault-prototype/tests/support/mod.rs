use {
    anchor_lang::Discriminator,
    litesvm::LiteSVM,
    solana_account::Account,
    solana_pubkey::Pubkey,
    solana_vault_prototype::{
        constants::{MINT_CONFIG_SEED, PROTOCOL_CONFIG_SEED},
        state::{MintConfig, ProtocolConfig, MINT_CONFIG_VERSION_V1, PROTOCOL_CONFIG_VERSION_V1},
    },
};

const PROTOCOL_CONFIG_LEN: usize = 200;
const MINT_CONFIG_LEN: usize = 160;

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}

fn token_program_id() -> Pubkey {
    Pubkey::from(anchor_spl::token::ID.to_bytes())
}

pub fn find_protocol_config() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id())
}

pub fn find_mint_config(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINT_CONFIG_SEED, mint.as_ref()], &program_id())
}

/// Existing integration suites predate M24 and test other instruction
/// properties. Install structurally exact, enabled test-only configuration so
/// those tests keep their original focus. M24 lifecycle behavior is exercised
/// separately through real instructions in test_mint_config.rs.
pub fn install_enabled_test_configs(svm: &mut LiteSVM, governance: Pubkey, mint: Pubkey) {
    let (protocol_config, protocol_bump) = find_protocol_config();
    let emergency = Pubkey::new_unique();
    let treasury = Pubkey::new_unique();
    let mut protocol_data = vec![0u8; PROTOCOL_CONFIG_LEN];
    protocol_data[0..8].copy_from_slice(ProtocolConfig::DISCRIMINATOR);
    protocol_data[8] = PROTOCOL_CONFIG_VERSION_V1;
    protocol_data[9] = protocol_bump;
    protocol_data[10..42].copy_from_slice(governance.as_ref());
    protocol_data[42..74].copy_from_slice(emergency.as_ref());
    protocol_data[74..106].copy_from_slice(treasury.as_ref());
    protocol_data[106..138].copy_from_slice(token_program_id().as_ref());
    svm.set_account(
        protocol_config,
        Account {
            lamports: 2_000_000,
            data: protocol_data,
            owner: program_id(),
            executable: false,
            rent_epoch: u64::MAX,
        },
    )
    .unwrap();

    let (mint_config, mint_bump) = find_mint_config(&mint);
    let mut mint_data = vec![0u8; MINT_CONFIG_LEN];
    mint_data[0..8].copy_from_slice(MintConfig::DISCRIMINATOR);
    mint_data[8] = MINT_CONFIG_VERSION_V1;
    mint_data[9] = mint_bump;
    mint_data[10..42].copy_from_slice(mint.as_ref());
    mint_data[42] = 1; // enabled
    mint_data[43..51].copy_from_slice(&u64::MAX.to_le_bytes());
    mint_data[51..59].copy_from_slice(&u64::MAX.to_le_bytes());
    // RolloutStage::Devnet, no pending update, and reserved bytes are all zero.
    svm.set_account(
        mint_config,
        Account {
            lamports: 2_000_000,
            data: mint_data,
            owner: program_id(),
            executable: false,
            rent_epoch: u64::MAX,
        },
    )
    .unwrap();
}

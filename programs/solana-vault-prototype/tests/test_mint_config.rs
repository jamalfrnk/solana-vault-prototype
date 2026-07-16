//! M24 — MintConfig, governed vault initialization, and exposure caps.

use {
    anchor_lang::{
        solana_program::instruction::Instruction, AccountDeserialize, Discriminator,
        InstructionData, ToAccountMetas,
    },
    base64::{engine::general_purpose::STANDARD, Engine as _},
    litesvm::LiteSVM,
    solana_account::Account,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_vault_prototype::{
        constants::{
            MINT_CONFIG_SEED, MINT_CONFIG_UPDATE_DELAY_SECONDS, PROTOCOL_CONFIG_SEED,
            USER_POSITION_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED,
        },
        events::{MintConfigChanged, MintConfigInitialized, MintConfigUpdateProposed},
        state::{
            MintConfig, OperationalState, ProtocolConfig, RolloutStage, VaultState,
            MINT_CONFIG_VERSION_V1, PROTOCOL_CONFIG_VERSION_V1,
        },
    },
};

const MINT_CONFIG_LEN: usize = 160;
const PROTOCOL_CONFIG_LEN: usize = 200;

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}

fn keypair_pubkey(keypair: &Keypair) -> Pubkey {
    Pubkey::from(keypair.pubkey().to_bytes())
}

fn token_program_id() -> Pubkey {
    Pubkey::from(anchor_spl::token::ID.to_bytes())
}

fn associated_token_program_id() -> Pubkey {
    Pubkey::from(anchor_spl::associated_token::ID.to_bytes())
}

fn system_program_id() -> Pubkey {
    Pubkey::from(anchor_lang::system_program::ID.to_bytes())
}

fn find_protocol_config() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id())
}

fn find_mint_config(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINT_CONFIG_SEED, mint.as_ref()], &program_id())
}

fn find_vault_state(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, mint.as_ref()], &program_id())
}

fn find_vault_authority(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, vault.as_ref()], &program_id())
}

fn find_user_position(vault: &Pubkey, user: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[USER_POSITION_SEED, vault.as_ref(), user.as_ref()],
        &program_id(),
    )
}

fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), token_program_id().as_ref(), mint.as_ref()],
        &associated_token_program_id(),
    )
    .0
}

fn make_mint_account(mint_authority: Option<Pubkey>, freeze_authority: Option<Pubkey>) -> Account {
    let mut data = vec![0u8; 82];
    if let Some(authority) = mint_authority {
        data[0..4].copy_from_slice(&1u32.to_le_bytes());
        data[4..36].copy_from_slice(authority.as_ref());
    }
    data[44] = 6;
    data[45] = 1;
    if let Some(authority) = freeze_authority {
        data[46..50].copy_from_slice(&1u32.to_le_bytes());
        data[50..82].copy_from_slice(authority.as_ref());
    }
    Account {
        lamports: 1_461_600,
        data,
        owner: token_program_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn make_token_account(owner: &Pubkey, mint: &Pubkey, amount: u64) -> Account {
    let mut data = vec![0u8; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1;
    Account {
        lamports: 2_039_280,
        data,
        owner: token_program_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn build_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program(
        program_id(),
        include_bytes!("../../../target/deploy/solana_vault_prototype.so"),
    )
    .unwrap();
    svm
}

fn install_protocol_config(svm: &mut LiteSVM, governance: Pubkey) -> Pubkey {
    let (address, bump) = find_protocol_config();
    let emergency = Pubkey::new_unique();
    let treasury = Pubkey::new_unique();
    let mut data = vec![0u8; PROTOCOL_CONFIG_LEN];
    data[0..8].copy_from_slice(ProtocolConfig::DISCRIMINATOR);
    data[8] = PROTOCOL_CONFIG_VERSION_V1;
    data[9] = bump;
    data[10..42].copy_from_slice(governance.as_ref());
    data[42..74].copy_from_slice(emergency.as_ref());
    data[74..106].copy_from_slice(treasury.as_ref());
    data[106..138].copy_from_slice(token_program_id().as_ref());
    svm.set_account(
        address,
        Account {
            lamports: 2_000_000,
            data,
            owner: program_id(),
            executable: false,
            rent_epoch: u64::MAX,
        },
    )
    .unwrap();
    address
}

fn send(
    svm: &mut LiteSVM,
    instruction: Instruction,
    signers: &[&Keypair],
    payer: &Keypair,
) -> Result<Vec<String>, String> {
    // LiteSVM records failed signatures too. Several authorization and boundary
    // tests intentionally retry identical messages, so force a fresh blockhash.
    svm.expire_blockhash();
    let message = Message::new_with_blockhash(
        &[instruction],
        Some(&keypair_pubkey(payer)),
        &svm.latest_blockhash(),
    );
    let transaction =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), signers).unwrap();
    svm.send_transaction(transaction)
        .map(|metadata| metadata.logs)
        .map_err(|error| format!("{:?}", error.err))
}

fn assert_custom_error(error: &str, number: u32) {
    assert!(
        error.contains(&format!("Custom({number})")),
        "expected custom error {number}, got {error}"
    );
}

fn initialize_mint_config_ix(payer: Pubkey, governance: Pubkey, mint: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::InitializeMintConfig {}.data(),
        solana_vault_prototype::accounts::InitializeMintConfig {
            payer,
            protocol_governance_authority: governance,
            protocol_config: find_protocol_config().0,
            mint,
            mint_config: find_mint_config(&mint).0,
            system_program: system_program_id(),
        }
        .to_account_metas(None),
    )
}

fn propose_update_ix(
    governance: Pubkey,
    mint: Pubkey,
    enabled: bool,
    max_total_assets: u64,
    max_deposit_assets_per_transaction: u64,
    rollout_stage: RolloutStage,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::ProposeMintConfigUpdate {
            enabled,
            max_total_assets,
            max_deposit_assets_per_transaction,
            rollout_stage,
        }
        .data(),
        solana_vault_prototype::accounts::GovernMintConfig {
            protocol_governance_authority: governance,
            protocol_config: find_protocol_config().0,
            mint_config: find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn execute_update_ix(mint: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::ExecuteMintConfigUpdate {}.data(),
        solana_vault_prototype::accounts::ExecuteMintConfigUpdate {
            protocol_config: find_protocol_config().0,
            mint_config: find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn disable_mint_ix(governance: Pubkey, mint: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::DisableMint {}.data(),
        solana_vault_prototype::accounts::GovernMintConfig {
            protocol_governance_authority: governance,
            protocol_config: find_protocol_config().0,
            mint_config: find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn lower_caps_ix(
    pause_authority: Pubkey,
    mint: Pubkey,
    max_total_assets: u64,
    max_deposit_assets_per_transaction: u64,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::LowerMintCaps {
            max_total_assets,
            max_deposit_assets_per_transaction,
        }
        .data(),
        solana_vault_prototype::accounts::LowerMintCaps {
            pause_authority,
            vault_state: find_vault_state(&mint).0,
            mint_config: find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn initialize_vault_ix(
    payer: Pubkey,
    pause_authority: Pubkey,
    governance: Pubkey,
    mint: Pubkey,
) -> Instruction {
    let vault = find_vault_state(&mint).0;
    let vault_authority = find_vault_authority(&vault).0;
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Initialize {}.data(),
        solana_vault_prototype::accounts::Initialize {
            payer,
            pause_authority,
            mint,
            vault_state: vault,
            vault_authority,
            custody: associated_token_address(&vault_authority, &mint),
            token_program: token_program_id(),
            associated_token_program: associated_token_program_id(),
            system_program: system_program_id(),
            protocol_governance_authority: governance,
            protocol_config: find_protocol_config().0,
            mint_config: find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn deposit_ix(user: Pubkey, mint: Pubkey, amount: u64) -> Instruction {
    let vault = find_vault_state(&mint).0;
    let vault_authority = find_vault_authority(&vault).0;
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Deposit { amount }.data(),
        solana_vault_prototype::accounts::Deposit {
            user,
            vault_state: vault,
            vault_authority,
            custody: associated_token_address(&vault_authority, &mint),
            user_token_account: associated_token_address(&user, &mint),
            user_position: find_user_position(&vault, &user).0,
            mint,
            token_program: token_program_id(),
            system_program: system_program_id(),
            mint_config: find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn withdraw_ix(user: Pubkey, mint: Pubkey, shares_in: u64) -> Instruction {
    let vault = find_vault_state(&mint).0;
    let vault_authority = find_vault_authority(&vault).0;
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Withdraw { shares_in }.data(),
        solana_vault_prototype::accounts::Withdraw {
            user,
            vault_state: vault,
            vault_authority,
            custody: associated_token_address(&vault_authority, &mint),
            user_token_account: associated_token_address(&user, &mint),
            user_position: find_user_position(&vault, &user).0,
            mint,
            token_program: token_program_id(),
        }
        .to_account_metas(None),
    )
}

struct Fixture {
    svm: LiteSVM,
    payer: Keypair,
    governance: Keypair,
    pause_authority: Keypair,
    mint: Pubkey,
}

impl Fixture {
    fn new(max_total_assets: u64, max_deposit_assets_per_transaction: u64) -> Self {
        let payer = Keypair::new();
        let governance = Keypair::new();
        let pause_authority = Keypair::new();
        let mint = Pubkey::new_unique();
        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(mint, make_mint_account(None, None))
            .unwrap();
        install_protocol_config(&mut svm, keypair_pubkey(&governance));
        send(
            &mut svm,
            initialize_mint_config_ix(keypair_pubkey(&payer), keypair_pubkey(&governance), mint),
            &[&payer, &governance],
            &payer,
        )
        .unwrap();
        let mut fixture = Self {
            svm,
            payer,
            governance,
            pause_authority,
            mint,
        };
        fixture
            .propose(
                true,
                max_total_assets,
                max_deposit_assets_per_transaction,
                RolloutStage::Devnet,
            )
            .unwrap();
        fixture.advance(MINT_CONFIG_UPDATE_DELAY_SECONDS);
        fixture.execute().unwrap();
        send(
            &mut fixture.svm,
            disable_mint_ix(keypair_pubkey(&fixture.governance), fixture.mint),
            &[&fixture.payer, &fixture.governance],
            &fixture.payer,
        )
        .unwrap();
        fixture
    }

    fn config(&self) -> MintConfig {
        let account = self
            .svm
            .get_account(&find_mint_config(&self.mint).0)
            .unwrap();
        MintConfig::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn vault(&self) -> VaultState {
        let account = self
            .svm
            .get_account(&find_vault_state(&self.mint).0)
            .unwrap();
        VaultState::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn propose(
        &mut self,
        enabled: bool,
        max_total_assets: u64,
        max_deposit_assets_per_transaction: u64,
        rollout_stage: RolloutStage,
    ) -> Result<Vec<String>, String> {
        send(
            &mut self.svm,
            propose_update_ix(
                keypair_pubkey(&self.governance),
                self.mint,
                enabled,
                max_total_assets,
                max_deposit_assets_per_transaction,
                rollout_stage,
            ),
            &[&self.payer, &self.governance],
            &self.payer,
        )
    }

    fn advance(&mut self, seconds: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp += seconds;
        clock.slot += seconds as u64;
        self.svm.set_sysvar(&clock);
    }

    fn execute(&mut self) -> Result<Vec<String>, String> {
        send(
            &mut self.svm,
            execute_update_ix(self.mint),
            &[&self.payer],
            &self.payer,
        )
    }

    fn enable_and_initialize_vault(&mut self) {
        let config = self.config();
        self.propose(
            true,
            config.max_total_assets,
            config.max_deposit_assets_per_transaction,
            config.rollout_stage,
        )
        .unwrap();
        self.advance(MINT_CONFIG_UPDATE_DELAY_SECONDS);
        self.execute().unwrap();
        send(
            &mut self.svm,
            initialize_vault_ix(
                keypair_pubkey(&self.payer),
                keypair_pubkey(&self.pause_authority),
                keypair_pubkey(&self.governance),
                self.mint,
            ),
            &[&self.payer, &self.pause_authority, &self.governance],
            &self.payer,
        )
        .unwrap();
    }

    fn fund_user(&mut self, user: &Keypair, amount: u64) {
        let user_pubkey = keypair_pubkey(user);
        self.svm.airdrop(&user.pubkey(), 1_000_000_000).unwrap();
        self.svm
            .set_account(
                associated_token_address(&user_pubkey, &self.mint),
                make_token_account(&user_pubkey, &self.mint, amount),
            )
            .unwrap();
    }
}

#[test]
fn test_initialize_mint_config_is_exact_disabled_devnet_and_emits_evidence() {
    let payer = Keypair::new();
    let governance = Keypair::new();
    let mint = Pubkey::new_unique();
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.set_account(mint, make_mint_account(None, None))
        .unwrap();
    install_protocol_config(&mut svm, keypair_pubkey(&governance));
    let mut clock = svm.get_sysvar::<Clock>();
    clock.slot = 24_024;
    clock.unix_timestamp = 1_800_000_000;
    svm.set_sysvar(&clock);

    let logs = send(
        &mut svm,
        initialize_mint_config_ix(keypair_pubkey(&payer), keypair_pubkey(&governance), mint),
        &[&payer, &governance],
        &payer,
    )
    .unwrap();

    let (address, bump) = find_mint_config(&mint);
    let account = svm.get_account(&address).unwrap();
    assert_eq!(MintConfig::ACCOUNT_LEN, MINT_CONFIG_LEN);
    assert_eq!(account.data.len(), MINT_CONFIG_LEN);
    let config = MintConfig::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(config.version, MINT_CONFIG_VERSION_V1);
    assert_eq!(config.bump, bump);
    assert_eq!(config.mint.to_bytes(), mint.to_bytes());
    assert!(!config.enabled);
    assert_eq!(config.max_total_assets, 0);
    assert_eq!(config.max_deposit_assets_per_transaction, 0);
    assert_eq!(config.rollout_stage, RolloutStage::Devnet);
    assert!(!config.has_pending_update);
    assert!(config.pending_state_is_valid());
    assert_eq!(config.reserved, [0; 73]);

    let bytes = STANDARD
        .decode(
            logs.iter()
                .find_map(|line| line.strip_prefix("Program data: "))
                .expect("MintConfigInitialized event missing"),
        )
        .unwrap();
    assert_eq!(&bytes[0..8], MintConfigInitialized::DISCRIMINATOR);
    assert_eq!(
        Pubkey::new_from_array(bytes[8..40].try_into().unwrap()),
        address
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[40..72].try_into().unwrap()),
        mint
    );
    assert_eq!(bytes[104], 0, "new config must be disabled");
}

#[test]
fn test_initialize_mint_config_rejects_issuer_authorities_and_wrong_governance() {
    for (mint_authority, freeze_authority, expected_error) in [
        (Some(Pubkey::new_unique()), None, 6026),
        (None, Some(Pubkey::new_unique()), 6006),
    ] {
        let payer = Keypair::new();
        let governance = Keypair::new();
        let mint = Pubkey::new_unique();
        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(mint, make_mint_account(mint_authority, freeze_authority))
            .unwrap();
        install_protocol_config(&mut svm, keypair_pubkey(&governance));
        let error = send(
            &mut svm,
            initialize_mint_config_ix(keypair_pubkey(&payer), keypair_pubkey(&governance), mint),
            &[&payer, &governance],
            &payer,
        )
        .unwrap_err();
        assert_custom_error(&error, expected_error);
    }

    let payer = Keypair::new();
    let governance = Keypair::new();
    let impostor = Keypair::new();
    let mint = Pubkey::new_unique();
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.set_account(mint, make_mint_account(None, None))
        .unwrap();
    install_protocol_config(&mut svm, keypair_pubkey(&governance));
    let error = send(
        &mut svm,
        initialize_mint_config_ix(keypair_pubkey(&payer), keypair_pubkey(&impostor), mint),
        &[&payer, &impostor],
        &payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6005);
}

#[test]
fn test_timelock_rejects_early_and_executes_exact_target_permissionlessly_at_boundary() {
    let mut fixture = Fixture::new(10_000, 1_000);
    let proposal_logs = fixture
        .propose(true, 20_000, 2_000, RolloutStage::Canary)
        .unwrap();
    let proposed = fixture.config();
    assert!(proposed.has_pending_update);
    assert!(proposed.pending_enabled);
    assert_eq!(proposed.pending_max_total_assets, 20_000);
    assert_eq!(proposed.pending_rollout_stage, RolloutStage::Canary);
    let proposal_bytes = STANDARD
        .decode(
            proposal_logs
                .iter()
                .find_map(|line| line.strip_prefix("Program data: "))
                .unwrap(),
        )
        .unwrap();
    assert_eq!(
        &proposal_bytes[0..8],
        MintConfigUpdateProposed::DISCRIMINATOR
    );

    fixture.advance(MINT_CONFIG_UPDATE_DELAY_SECONDS - 1);
    let error = fixture.execute().unwrap_err();
    assert_custom_error(&error, 6038);
    fixture.advance(1);

    let execution_logs = fixture.execute().unwrap();
    let config = fixture.config();
    assert!(config.enabled);
    assert_eq!(config.max_total_assets, 20_000);
    assert_eq!(config.max_deposit_assets_per_transaction, 2_000);
    assert_eq!(config.rollout_stage, RolloutStage::Canary);
    assert!(!config.has_pending_update);
    assert!(config.pending_state_is_valid());
    let change_bytes = STANDARD
        .decode(
            execution_logs
                .iter()
                .find_map(|line| line.strip_prefix("Program data: "))
                .unwrap(),
        )
        .unwrap();
    assert_eq!(&change_bytes[0..8], MintConfigChanged::DISCRIMINATOR);
    assert_eq!(*change_bytes.last().unwrap(), 2);
}

#[test]
fn test_proposal_replacement_and_risk_increase_rules_fail_closed() {
    let mut fixture = Fixture::new(10_000, 1_000);
    fixture
        .propose(true, 20_000, 2_000, RolloutStage::Canary)
        .unwrap();
    fixture
        .propose(true, 15_000, 1_500, RolloutStage::Devnet)
        .unwrap();
    let config = fixture.config();
    assert_eq!(config.pending_max_total_assets, 15_000);
    assert_eq!(config.pending_max_deposit_assets_per_transaction, 1_500);
    assert_eq!(config.pending_rollout_stage, RolloutStage::Devnet);

    for result in [
        fixture.propose(false, 15_000, 1_500, RolloutStage::Devnet),
        fixture.propose(true, 9_999, 1_500, RolloutStage::Devnet),
        fixture.propose(true, 15_000, 1_500, RolloutStage::Limited),
    ] {
        assert_custom_error(&result.unwrap_err(), 6036);
    }
}

#[test]
fn test_disable_is_immediate_idempotent_and_cancels_pending_update() {
    let mut fixture = Fixture::new(10_000, 1_000);
    fixture
        .propose(true, 20_000, 2_000, RolloutStage::Canary)
        .unwrap();
    let logs = send(
        &mut fixture.svm,
        disable_mint_ix(keypair_pubkey(&fixture.governance), fixture.mint),
        &[&fixture.payer, &fixture.governance],
        &fixture.payer,
    )
    .unwrap();
    let config = fixture.config();
    assert!(!config.enabled);
    assert!(!config.has_pending_update);
    assert!(config.pending_state_is_valid());
    let bytes = STANDARD
        .decode(
            logs.iter()
                .find_map(|line| line.strip_prefix("Program data: "))
                .unwrap(),
        )
        .unwrap();
    assert_eq!(&bytes[0..8], MintConfigChanged::DISCRIMINATOR);
    assert_eq!(*bytes.last().unwrap(), 1);
    assert_custom_error(&fixture.execute().unwrap_err(), 6037);

    send(
        &mut fixture.svm,
        disable_mint_ix(keypair_pubkey(&fixture.governance), fixture.mint),
        &[&fixture.payer, &fixture.governance],
        &fixture.payer,
    )
    .unwrap();
}

#[test]
fn test_governed_vault_initialization_rejects_disabled_and_wrong_signer_then_succeeds() {
    let mut fixture = Fixture::new(10_000, 1_000);
    let init = initialize_vault_ix(
        keypair_pubkey(&fixture.payer),
        keypair_pubkey(&fixture.pause_authority),
        keypair_pubkey(&fixture.governance),
        fixture.mint,
    );
    let error = send(
        &mut fixture.svm,
        init,
        &[
            &fixture.payer,
            &fixture.pause_authority,
            &fixture.governance,
        ],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6031);

    let impostor = Keypair::new();
    fixture
        .propose(true, 10_000, 1_000, RolloutStage::Devnet)
        .unwrap();
    fixture.advance(MINT_CONFIG_UPDATE_DELAY_SECONDS);
    fixture.execute().unwrap();
    let error = send(
        &mut fixture.svm,
        initialize_vault_ix(
            keypair_pubkey(&fixture.payer),
            keypair_pubkey(&fixture.pause_authority),
            keypair_pubkey(&impostor),
            fixture.mint,
        ),
        &[&fixture.payer, &fixture.pause_authority, &impostor],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6005);

    send(
        &mut fixture.svm,
        initialize_vault_ix(
            keypair_pubkey(&fixture.payer),
            keypair_pubkey(&fixture.pause_authority),
            keypair_pubkey(&fixture.governance),
            fixture.mint,
        ),
        &[
            &fixture.payer,
            &fixture.pause_authority,
            &fixture.governance,
        ],
        &fixture.payer,
    )
    .unwrap();
    assert_eq!(fixture.vault().operational_state, OperationalState::Active);
}

#[test]
fn test_deposit_enforces_per_transaction_and_total_caps_at_exact_boundaries() {
    let mut fixture = Fixture::new(1_500, 1_000);
    fixture.enable_and_initialize_vault();
    let first = Keypair::new();
    fixture.fund_user(&first, 2_000);
    send(
        &mut fixture.svm,
        deposit_ix(keypair_pubkey(&first), fixture.mint, 1_000),
        &[&first],
        &first,
    )
    .unwrap();
    assert_eq!(fixture.vault().total_assets, 1_000);

    let over_per_tx = send(
        &mut fixture.svm,
        deposit_ix(keypair_pubkey(&first), fixture.mint, 1_001),
        &[&first],
        &first,
    )
    .unwrap_err();
    assert_custom_error(&over_per_tx, 6032);

    let second = Keypair::new();
    fixture.fund_user(&second, 1_000);
    send(
        &mut fixture.svm,
        deposit_ix(keypair_pubkey(&second), fixture.mint, 500),
        &[&second],
        &second,
    )
    .unwrap();
    assert_eq!(fixture.vault().total_assets, 1_500);
    let over_total = send(
        &mut fixture.svm,
        deposit_ix(keypair_pubkey(&second), fixture.mint, 1),
        &[&second],
        &second,
    )
    .unwrap_err();
    assert_custom_error(&over_total, 6033);
    assert_eq!(fixture.vault().total_assets, 1_500);
}

#[test]
fn test_zero_caps_and_total_overflow_block_deposits_without_state_change() {
    let mut zero = Fixture::new(0, 0);
    zero.enable_and_initialize_vault();
    let user = Keypair::new();
    zero.fund_user(&user, 1);
    let error = send(
        &mut zero.svm,
        deposit_ix(keypair_pubkey(&user), zero.mint, 1),
        &[&user],
        &user,
    )
    .unwrap_err();
    assert_custom_error(&error, 6032);
    assert_eq!(zero.vault().total_assets, 0);

    let mut overflow = Fixture::new(u64::MAX, u64::MAX);
    overflow.enable_and_initialize_vault();
    let vault_address = find_vault_state(&overflow.mint).0;
    let mut vault = overflow.svm.get_account(&vault_address).unwrap();
    vault.data[74..82].copy_from_slice(&u64::MAX.to_le_bytes());
    overflow.svm.set_account(vault_address, vault).unwrap();
    let user = Keypair::new();
    overflow.fund_user(&user, 1);
    let error = send(
        &mut overflow.svm,
        deposit_ix(keypair_pubkey(&user), overflow.mint, 1),
        &[&user],
        &user,
    )
    .unwrap_err();
    assert_custom_error(&error, 6040);
    assert_eq!(overflow.vault().total_assets, u64::MAX);
}

#[test]
fn test_pause_authority_can_only_lower_caps_and_reduction_cancels_pending() {
    let mut fixture = Fixture::new(10_000, 1_000);
    fixture.enable_and_initialize_vault();
    fixture
        .propose(true, 20_000, 2_000, RolloutStage::Canary)
        .unwrap();
    send(
        &mut fixture.svm,
        lower_caps_ix(
            keypair_pubkey(&fixture.pause_authority),
            fixture.mint,
            5_000,
            500,
        ),
        &[&fixture.payer, &fixture.pause_authority],
        &fixture.payer,
    )
    .unwrap();
    let config = fixture.config();
    assert_eq!(config.max_total_assets, 5_000);
    assert_eq!(config.max_deposit_assets_per_transaction, 500);
    assert!(!config.has_pending_update);
    assert_custom_error(&fixture.execute().unwrap_err(), 6037);

    let error = send(
        &mut fixture.svm,
        lower_caps_ix(
            keypair_pubkey(&fixture.pause_authority),
            fixture.mint,
            5_001,
            500,
        ),
        &[&fixture.payer, &fixture.pause_authority],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6035);

    let impostor = Keypair::new();
    let error = send(
        &mut fixture.svm,
        lower_caps_ix(keypair_pubkey(&impostor), fixture.mint, 4_000, 400),
        &[&fixture.payer, &impostor],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6005);
}

#[test]
fn test_disable_and_zero_caps_never_block_active_or_exit_only_withdrawals() {
    let mut fixture = Fixture::new(10_000, 1_000);
    fixture.enable_and_initialize_vault();
    let user = Keypair::new();
    fixture.fund_user(&user, 1_000);
    send(
        &mut fixture.svm,
        deposit_ix(keypair_pubkey(&user), fixture.mint, 1_000),
        &[&user],
        &user,
    )
    .unwrap();
    send(
        &mut fixture.svm,
        lower_caps_ix(keypair_pubkey(&fixture.pause_authority), fixture.mint, 0, 0),
        &[&fixture.payer, &fixture.pause_authority],
        &fixture.payer,
    )
    .unwrap();
    send(
        &mut fixture.svm,
        disable_mint_ix(keypair_pubkey(&fixture.governance), fixture.mint),
        &[&fixture.payer, &fixture.governance],
        &fixture.payer,
    )
    .unwrap();

    send(
        &mut fixture.svm,
        withdraw_ix(keypair_pubkey(&user), fixture.mint, 500),
        &[&user],
        &user,
    )
    .unwrap();
    let vault_address = find_vault_state(&fixture.mint).0;
    let mut vault = fixture.svm.get_account(&vault_address).unwrap();
    vault.data[90] = OperationalState::ExitOnly as u8;
    fixture.svm.set_account(vault_address, vault).unwrap();
    send(
        &mut fixture.svm,
        withdraw_ix(keypair_pubkey(&user), fixture.mint, 500),
        &[&user],
        &user,
    )
    .unwrap();
    assert_eq!(fixture.vault().total_assets, 0);
}

#[test]
fn test_malformed_and_substituted_mint_config_fail_closed_before_deposit() {
    for (offset, value, expected_error) in [(8usize, 2u8, 6027), (159, 1, 6028), (61, 1, 6029)] {
        let mut fixture = Fixture::new(10_000, 1_000);
        fixture.enable_and_initialize_vault();
        let config_address = find_mint_config(&fixture.mint).0;
        let mut config = fixture.svm.get_account(&config_address).unwrap();
        config.data[offset] = value;
        fixture.svm.set_account(config_address, config).unwrap();
        let user = Keypair::new();
        fixture.fund_user(&user, 10);
        let error = send(
            &mut fixture.svm,
            deposit_ix(keypair_pubkey(&user), fixture.mint, 1),
            &[&user],
            &user,
        )
        .unwrap_err();
        assert_custom_error(&error, expected_error);
        assert_eq!(fixture.vault().total_assets, 0);
    }

    let mut fixture = Fixture::new(10_000, 1_000);
    fixture.enable_and_initialize_vault();
    let user = Keypair::new();
    fixture.fund_user(&user, 10);
    let other_mint = Pubkey::new_unique();
    let mut instruction = deposit_ix(keypair_pubkey(&user), fixture.mint, 1);
    instruction.accounts.last_mut().unwrap().pubkey = find_mint_config(&other_mint).0;
    let error = send(&mut fixture.svm, instruction, &[&user], &user).unwrap_err();
    assert_custom_error(&error, 3012); // Anchor AccountNotInitialized
    assert_eq!(fixture.vault().total_assets, 0);
}

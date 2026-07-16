//! M23 — upgrade-authority-gated ProtocolConfig and emergency state controls.

use {
    anchor_lang::{
        solana_program::{
            bpf_loader_upgradeable::{self, UpgradeableLoaderState},
            instruction::Instruction,
        },
        AccountDeserialize, Discriminator, InstructionData, ToAccountMetas,
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
        constants::{PROTOCOL_CONFIG_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
        events::{OperationalStateChanged, ProtocolConfigInitialized},
        state::{
            OperationalState, OperationalStateReason, ProtocolConfig, VaultState,
            PROTOCOL_CONFIG_VERSION_V1, VAULT_STATE_VERSION_V1,
        },
    },
};

const PROTOCOL_CONFIG_LEN: usize = 200;
const VAULT_STATE_LEN: usize = 145;

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}

fn keypair_pubkey(keypair: &Keypair) -> Pubkey {
    Pubkey::from(keypair.pubkey().to_bytes())
}

fn anchor_pubkey(pubkey: &Pubkey) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::from(pubkey.to_bytes())
}

fn system_program_id() -> Pubkey {
    Pubkey::from(anchor_lang::system_program::ID.to_bytes())
}

fn upgradeable_loader_id() -> Pubkey {
    Pubkey::from(bpf_loader_upgradeable::ID.to_bytes())
}

fn token_program_id() -> Pubkey {
    Pubkey::from(anchor_spl::token::ID.to_bytes())
}

fn find_protocol_config() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id())
}

fn find_program_data() -> Pubkey {
    Pubkey::find_program_address(&[program_id().as_ref()], &upgradeable_loader_id()).0
}

fn find_vault_state(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, mint.as_ref()], &program_id())
}

fn find_vault_authority(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, vault.as_ref()], &program_id())
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

fn set_upgrade_authority(svm: &mut LiteSVM, authority: Option<Pubkey>) {
    let address = find_program_data();
    let mut account = svm
        .get_account(&address)
        .expect("LiteSVM must install ProgramData for the upgradeable program");
    let state = UpgradeableLoaderState::ProgramData {
        slot: 0,
        upgrade_authority_address: authority.as_ref().map(anchor_pubkey),
    };
    let encoded = bincode::serialize(&state).unwrap();
    let metadata_len = UpgradeableLoaderState::size_of_programdata_metadata();
    account.data[..metadata_len].fill(0);
    account.data[..encoded.len()].copy_from_slice(&encoded);
    svm.set_account(address, account).unwrap();
}

fn make_initialize_protocol_config_ix(
    payer: Pubkey,
    upgrade_authority: Pubkey,
    program_data: Pubkey,
    protocol_governance_authority: Pubkey,
    emergency_authority: Pubkey,
    treasury: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::InitializeProtocolConfig {
            protocol_governance_authority: anchor_pubkey(&protocol_governance_authority),
            emergency_authority: anchor_pubkey(&emergency_authority),
            treasury: anchor_pubkey(&treasury),
        }
        .data(),
        solana_vault_prototype::accounts::InitializeProtocolConfig {
            payer,
            upgrade_authority,
            protocol_config: find_protocol_config().0,
            program: program_id(),
            program_data,
            system_program: system_program_id(),
        }
        .to_account_metas(None),
    )
}

fn make_emergency_pause_ix(
    emergency_authority: Pubkey,
    protocol_config: Pubkey,
    vault_state: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::EmergencyPause {
            reason: OperationalStateReason::IncidentResponse,
        }
        .data(),
        solana_vault_prototype::accounts::EmergencyControl {
            emergency_authority,
            protocol_config,
            vault_state,
        }
        .to_account_metas(None),
    )
}

fn make_emergency_resume_ix(
    emergency_authority: Pubkey,
    protocol_config: Pubkey,
    vault_state: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::EmergencyResume {
            reason: OperationalStateReason::IncidentResolved,
        }
        .data(),
        solana_vault_prototype::accounts::EmergencyControl {
            emergency_authority,
            protocol_config,
            vault_state,
        }
        .to_account_metas(None),
    )
}

fn send(
    svm: &mut LiteSVM,
    instruction: Instruction,
    signers: &[&Keypair],
    payer: &Keypair,
) -> Result<Vec<String>, String> {
    let blockhash = svm.latest_blockhash();
    let message =
        Message::new_with_blockhash(&[instruction], Some(&keypair_pubkey(payer)), &blockhash);
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

fn set_vault_state(svm: &mut LiteSVM, mint: Pubkey, state: OperationalState) -> Pubkey {
    let (vault, vault_bump) = find_vault_state(&mint);
    let (_, authority_bump) = find_vault_authority(&vault);
    let pause_authority = Pubkey::new_unique();
    let pending_authority = Pubkey::new_unique();
    let mut data = vec![0u8; VAULT_STATE_LEN];
    data[0..8].copy_from_slice(VaultState::DISCRIMINATOR);
    data[8..40].copy_from_slice(pause_authority.as_ref());
    data[40..72].copy_from_slice(mint.as_ref());
    data[72] = vault_bump;
    data[73] = authority_bump;
    data[74..82].copy_from_slice(&42u64.to_le_bytes());
    data[82..90].copy_from_slice(&17u64.to_le_bytes());
    data[90] = state as u8;
    data[91..123].copy_from_slice(pending_authority.as_ref());
    data[123] = VAULT_STATE_VERSION_V1;
    svm.set_account(
        vault,
        Account {
            lamports: 2_000_000,
            data,
            owner: program_id(),
            executable: false,
            rent_epoch: u64::MAX,
        },
    )
    .unwrap();
    vault
}

struct Fixture {
    svm: LiteSVM,
    payer: Keypair,
    upgrade_authority: Keypair,
    emergency_authority: Keypair,
    protocol_config: Pubkey,
    vault_state: Pubkey,
}

impl Fixture {
    fn new(initial_state: OperationalState) -> Self {
        let payer = Keypair::new();
        let upgrade_authority = Keypair::new();
        let emergency_authority = Keypair::new();
        let protocol_governance_authority = Pubkey::new_unique();
        let treasury = Pubkey::new_unique();
        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&emergency_authority.pubkey(), 1_000_000_000)
            .unwrap();
        set_upgrade_authority(&mut svm, Some(keypair_pubkey(&upgrade_authority)));
        let init = make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&upgrade_authority),
            find_program_data(),
            protocol_governance_authority,
            keypair_pubkey(&emergency_authority),
            treasury,
        );
        send(&mut svm, init, &[&payer, &upgrade_authority], &payer).unwrap();
        let vault_state = set_vault_state(&mut svm, Pubkey::new_unique(), initial_state);
        Self {
            svm,
            payer,
            upgrade_authority,
            emergency_authority,
            protocol_config: find_protocol_config().0,
            vault_state,
        }
    }

    fn vault(&self) -> VaultState {
        let account = self.svm.get_account(&self.vault_state).unwrap();
        VaultState::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
}

#[test]
fn test_initialize_protocol_config_uses_exact_layout_and_emits_evidence() {
    let payer = Keypair::new();
    let upgrade_authority = Keypair::new();
    let governance = Pubkey::new_unique();
    let emergency = Pubkey::new_unique();
    let treasury = Pubkey::new_unique();
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    set_upgrade_authority(&mut svm, Some(keypair_pubkey(&upgrade_authority)));
    let mut clock = svm.get_sysvar::<Clock>();
    clock.slot = 23_023;
    clock.unix_timestamp = 1_760_000_000;
    svm.set_sysvar(&clock);

    let logs = send(
        &mut svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&upgrade_authority),
            find_program_data(),
            governance,
            emergency,
            treasury,
        ),
        &[&payer, &upgrade_authority],
        &payer,
    )
    .unwrap();

    let (config_address, expected_bump) = find_protocol_config();
    let account = svm.get_account(&config_address).unwrap();
    assert_eq!(ProtocolConfig::ACCOUNT_LEN, PROTOCOL_CONFIG_LEN);
    assert_eq!(account.data.len(), PROTOCOL_CONFIG_LEN);
    let config = ProtocolConfig::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(config.version, PROTOCOL_CONFIG_VERSION_V1);
    assert_eq!(config.bump, expected_bump);
    assert_eq!(
        config.protocol_governance_authority,
        anchor_pubkey(&governance)
    );
    assert_eq!(config.emergency_authority, anchor_pubkey(&emergency));
    assert_eq!(config.treasury, anchor_pubkey(&treasury));
    assert_eq!(config.token_program, anchor_spl::token::ID);
    assert_eq!(config.reserved, [0; 62]);

    let encoded = logs
        .iter()
        .find_map(|line| line.strip_prefix("Program data: "))
        .expect("ProtocolConfigInitialized event missing");
    let bytes = STANDARD.decode(encoded).unwrap();
    assert_eq!(bytes.len(), 217);
    assert_eq!(&bytes[0..8], ProtocolConfigInitialized::DISCRIMINATOR);
    assert_eq!(
        Pubkey::new_from_array(bytes[8..40].try_into().unwrap()),
        config_address
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[40..72].try_into().unwrap()),
        keypair_pubkey(&upgrade_authority)
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[72..104].try_into().unwrap()),
        governance
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[104..136].try_into().unwrap()),
        emergency
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[136..168].try_into().unwrap()),
        treasury
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[168..200].try_into().unwrap()),
        token_program_id()
    );
    assert_eq!(
        u64::from_le_bytes(bytes[200..208].try_into().unwrap()),
        clock.slot
    );
    assert_eq!(
        i64::from_le_bytes(bytes[208..216].try_into().unwrap()),
        clock.unix_timestamp
    );
    assert_eq!(bytes[216], PROTOCOL_CONFIG_VERSION_V1);
}

#[test]
fn test_protocol_config_bootstrap_rejects_wrong_authority_and_program_data() {
    let payer = Keypair::new();
    let real_upgrade_authority = Keypair::new();
    let impostor = Keypair::new();
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    set_upgrade_authority(&mut svm, Some(keypair_pubkey(&real_upgrade_authority)));

    let role = || Pubkey::new_unique();
    let wrong_authority_error = send(
        &mut svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&impostor),
            find_program_data(),
            role(),
            role(),
            role(),
        ),
        &[&payer, &impostor],
        &payer,
    )
    .unwrap_err();
    assert_custom_error(&wrong_authority_error, 6005);

    let wrong_program_data = Pubkey::new_unique();
    let canonical = svm.get_account(&find_program_data()).unwrap();
    svm.set_account(wrong_program_data, canonical).unwrap();
    let wrong_data_error = send(
        &mut svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&real_upgrade_authority),
            wrong_program_data,
            role(),
            role(),
            role(),
        ),
        &[&payer, &real_upgrade_authority],
        &payer,
    )
    .unwrap_err();
    assert_custom_error(&wrong_data_error, 6019);
}

#[test]
fn test_protocol_config_bootstrap_rejects_immutable_program_and_invalid_roles() {
    let payer = Keypair::new();
    let upgrade_authority = Keypair::new();
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    set_upgrade_authority(&mut svm, None);
    let unique = || Pubkey::new_unique();
    let immutable_error = send(
        &mut svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&upgrade_authority),
            find_program_data(),
            unique(),
            unique(),
            unique(),
        ),
        &[&payer, &upgrade_authority],
        &payer,
    )
    .unwrap_err();
    assert_custom_error(&immutable_error, 6005);

    set_upgrade_authority(&mut svm, Some(keypair_pubkey(&upgrade_authority)));
    let default_error = send(
        &mut svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&upgrade_authority),
            find_program_data(),
            Pubkey::default(),
            unique(),
            unique(),
        ),
        &[&payer, &upgrade_authority],
        &payer,
    )
    .unwrap_err();
    assert_custom_error(&default_error, 6020);

    let duplicate = unique();
    let duplicate_error = send(
        &mut svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&upgrade_authority),
            find_program_data(),
            duplicate,
            duplicate,
            unique(),
        ),
        &[&payer, &upgrade_authority],
        &payer,
    )
    .unwrap_err();
    assert_custom_error(&duplicate_error, 6021);
}

#[test]
fn test_protocol_config_duplicate_initialization_fails() {
    let mut fixture = Fixture::new(OperationalState::Active);
    fixture.svm.expire_blockhash();
    let error = send(
        &mut fixture.svm,
        make_initialize_protocol_config_ix(
            keypair_pubkey(&fixture.payer),
            keypair_pubkey(&fixture.upgrade_authority),
            find_program_data(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
        ),
        &[&fixture.payer, &fixture.upgrade_authority],
        &fixture.payer,
    )
    .unwrap_err();
    assert!(
        !error.is_empty(),
        "duplicate singleton initialization must fail"
    );
}

#[test]
fn test_emergency_transition_matrix_and_non_state_preservation() {
    for initial_state in [OperationalState::Active, OperationalState::ExitOnly] {
        let mut fixture = Fixture::new(initial_state);
        let before = fixture.svm.get_account(&fixture.vault_state).unwrap().data;
        send(
            &mut fixture.svm,
            make_emergency_pause_ix(
                keypair_pubkey(&fixture.emergency_authority),
                fixture.protocol_config,
                fixture.vault_state,
            ),
            &[&fixture.payer, &fixture.emergency_authority],
            &fixture.payer,
        )
        .unwrap();
        assert_eq!(
            fixture.vault().operational_state,
            OperationalState::FullyPaused
        );
        let after = fixture.svm.get_account(&fixture.vault_state).unwrap().data;
        assert_eq!(&before[..90], &after[..90]);
        assert_eq!(&before[91..], &after[91..]);

        fixture.svm.expire_blockhash();
        send(
            &mut fixture.svm,
            make_emergency_pause_ix(
                keypair_pubkey(&fixture.emergency_authority),
                fixture.protocol_config,
                fixture.vault_state,
            ),
            &[&fixture.payer, &fixture.emergency_authority],
            &fixture.payer,
        )
        .unwrap();

        send(
            &mut fixture.svm,
            make_emergency_resume_ix(
                keypair_pubkey(&fixture.emergency_authority),
                fixture.protocol_config,
                fixture.vault_state,
            ),
            &[&fixture.payer, &fixture.emergency_authority],
            &fixture.payer,
        )
        .unwrap();
        assert_eq!(
            fixture.vault().operational_state,
            OperationalState::ExitOnly
        );

        fixture.svm.expire_blockhash();
        send(
            &mut fixture.svm,
            make_emergency_resume_ix(
                keypair_pubkey(&fixture.emergency_authority),
                fixture.protocol_config,
                fixture.vault_state,
            ),
            &[&fixture.payer, &fixture.emergency_authority],
            &fixture.payer,
        )
        .unwrap();
        assert_eq!(
            fixture.vault().operational_state,
            OperationalState::ExitOnly
        );
    }

    let mut active = Fixture::new(OperationalState::Active);
    let error = send(
        &mut active.svm,
        make_emergency_resume_ix(
            keypair_pubkey(&active.emergency_authority),
            active.protocol_config,
            active.vault_state,
        ),
        &[&active.payer, &active.emergency_authority],
        &active.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6025);
    assert_eq!(active.vault().operational_state, OperationalState::Active);
}

#[test]
fn test_emergency_controls_reject_authority_and_account_substitution() {
    let mut fixture = Fixture::new(OperationalState::ExitOnly);
    let impostor = Keypair::new();
    fixture
        .svm
        .airdrop(&impostor.pubkey(), 1_000_000_000)
        .unwrap();
    let wrong_authority = send(
        &mut fixture.svm,
        make_emergency_pause_ix(
            keypair_pubkey(&impostor),
            fixture.protocol_config,
            fixture.vault_state,
        ),
        &[&fixture.payer, &impostor],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&wrong_authority, 6005);

    let wrong_config = Pubkey::new_unique();
    let config_account = fixture.svm.get_account(&fixture.protocol_config).unwrap();
    fixture
        .svm
        .set_account(wrong_config, config_account)
        .unwrap();
    let config_substitution = send(
        &mut fixture.svm,
        make_emergency_pause_ix(
            keypair_pubkey(&fixture.emergency_authority),
            wrong_config,
            fixture.vault_state,
        ),
        &[&fixture.payer, &fixture.emergency_authority],
        &fixture.payer,
    )
    .unwrap_err();
    assert!(!config_substitution.is_empty());

    let wrong_vault = Pubkey::new_unique();
    let vault_account = fixture.svm.get_account(&fixture.vault_state).unwrap();
    fixture.svm.set_account(wrong_vault, vault_account).unwrap();
    let vault_substitution = send(
        &mut fixture.svm,
        make_emergency_pause_ix(
            keypair_pubkey(&fixture.emergency_authority),
            fixture.protocol_config,
            wrong_vault,
        ),
        &[&fixture.payer, &fixture.emergency_authority],
        &fixture.payer,
    )
    .unwrap_err();
    assert!(!vault_substitution.is_empty());
}

#[test]
fn test_emergency_controls_reject_malformed_config_and_vault_versions() {
    for (offset, value, error_number) in [
        (8usize, 2u8, 6022u32),
        (138usize, 1u8, 6023u32),
        (106usize, 1u8, 6024u32),
    ] {
        let mut fixture = Fixture::new(OperationalState::ExitOnly);
        let mut config = fixture.svm.get_account(&fixture.protocol_config).unwrap();
        config.data[offset] = value;
        fixture
            .svm
            .set_account(fixture.protocol_config, config)
            .unwrap();
        let error = send(
            &mut fixture.svm,
            make_emergency_pause_ix(
                keypair_pubkey(&fixture.emergency_authority),
                fixture.protocol_config,
                fixture.vault_state,
            ),
            &[&fixture.payer, &fixture.emergency_authority],
            &fixture.payer,
        )
        .unwrap_err();
        assert_custom_error(&error, error_number);
    }

    let mut fixture = Fixture::new(OperationalState::ExitOnly);
    let mut vault = fixture.svm.get_account(&fixture.vault_state).unwrap();
    vault.data[123] = 0;
    fixture.svm.set_account(fixture.vault_state, vault).unwrap();
    let error = send(
        &mut fixture.svm,
        make_emergency_pause_ix(
            keypair_pubkey(&fixture.emergency_authority),
            fixture.protocol_config,
            fixture.vault_state,
        ),
        &[&fixture.payer, &fixture.emergency_authority],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6010);
}

#[test]
fn test_emergency_transition_event_retains_exact_m22_wire_contract() {
    let mut fixture = Fixture::new(OperationalState::ExitOnly);
    let mut clock = fixture.svm.get_sysvar::<Clock>();
    clock.slot = 77_777;
    clock.unix_timestamp = 1_760_000_123;
    fixture.svm.set_sysvar(&clock);
    let emergency = keypair_pubkey(&fixture.emergency_authority);
    let logs = send(
        &mut fixture.svm,
        make_emergency_pause_ix(emergency, fixture.protocol_config, fixture.vault_state),
        &[&fixture.payer, &fixture.emergency_authority],
        &fixture.payer,
    )
    .unwrap();
    let encoded = logs
        .iter()
        .find_map(|line| line.strip_prefix("Program data: "))
        .expect("OperationalStateChanged event missing");
    let bytes = STANDARD.decode(encoded).unwrap();
    assert_eq!(bytes.len(), 91);
    assert_eq!(&bytes[0..8], OperationalStateChanged::DISCRIMINATOR);
    assert_eq!(
        Pubkey::new_from_array(bytes[8..40].try_into().unwrap()),
        fixture.vault_state
    );
    assert_eq!(bytes[40], OperationalState::ExitOnly as u8);
    assert_eq!(bytes[41], OperationalState::FullyPaused as u8);
    assert_eq!(
        Pubkey::new_from_array(bytes[42..74].try_into().unwrap()),
        emergency
    );
    assert_eq!(
        u64::from_le_bytes(bytes[74..82].try_into().unwrap()),
        clock.slot
    );
    assert_eq!(
        i64::from_le_bytes(bytes[82..90].try_into().unwrap()),
        clock.unix_timestamp
    );
    assert_eq!(bytes[90], OperationalStateReason::IncidentResponse as u8);
}

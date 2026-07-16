//! M25 — ADR 0008 constrained exact-excess recovery.

use {
    anchor_lang::{
        solana_program::instruction::{AccountMeta, Instruction},
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
        constants::{
            MINT_CONFIG_SEED, PROTOCOL_CONFIG_SEED, USER_POSITION_SEED, VAULT_AUTHORITY_SEED,
            VAULT_SEED,
        },
        events::ExcessSwept,
        state::{
            MintConfig, OperationalState, ProtocolConfig, UserPosition, VaultState,
            MINT_CONFIG_VERSION_V1, PROTOCOL_CONFIG_VERSION_V1, VAULT_STATE_VERSION_V1,
        },
    },
};

const VAULT_STATE_LEN: usize = 145;
const USER_POSITION_LEN: usize = 81;
const PROTOCOL_CONFIG_LEN: usize = 200;
const MINT_CONFIG_LEN: usize = 160;

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

fn make_mint_account() -> Account {
    let mut data = vec![0u8; 82];
    data[44] = 6;
    data[45] = 1;
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

#[allow(clippy::too_many_arguments)]
fn make_vault_state_account(
    pause_authority: Pubkey,
    mint: Pubkey,
    vault_bump: u8,
    authority_bump: u8,
    total_assets: u64,
    total_shares: u64,
    operational_state: OperationalState,
) -> Account {
    let mut data = vec![0u8; VAULT_STATE_LEN];
    data[0..8].copy_from_slice(VaultState::DISCRIMINATOR);
    data[8..40].copy_from_slice(pause_authority.as_ref());
    data[40..72].copy_from_slice(mint.as_ref());
    data[72] = vault_bump;
    data[73] = authority_bump;
    data[74..82].copy_from_slice(&total_assets.to_le_bytes());
    data[82..90].copy_from_slice(&total_shares.to_le_bytes());
    data[90] = operational_state as u8;
    data[123] = VAULT_STATE_VERSION_V1;
    Account {
        lamports: 2_000_000,
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn make_protocol_config_account(bump: u8, governance: Pubkey, treasury: Pubkey) -> Account {
    let emergency = Pubkey::new_unique();
    let mut data = vec![0u8; PROTOCOL_CONFIG_LEN];
    data[0..8].copy_from_slice(ProtocolConfig::DISCRIMINATOR);
    data[8] = PROTOCOL_CONFIG_VERSION_V1;
    data[9] = bump;
    data[10..42].copy_from_slice(governance.as_ref());
    data[42..74].copy_from_slice(emergency.as_ref());
    data[74..106].copy_from_slice(treasury.as_ref());
    data[106..138].copy_from_slice(token_program_id().as_ref());
    Account {
        lamports: 2_000_000,
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn make_mint_config_account(mint: Pubkey, bump: u8) -> Account {
    let mut data = vec![0u8; MINT_CONFIG_LEN];
    data[0..8].copy_from_slice(MintConfig::DISCRIMINATOR);
    data[8] = MINT_CONFIG_VERSION_V1;
    data[9] = bump;
    data[10..42].copy_from_slice(mint.as_ref());
    data[42] = 1;
    data[43..51].copy_from_slice(&u64::MAX.to_le_bytes());
    data[51..59].copy_from_slice(&u64::MAX.to_le_bytes());
    Account {
        lamports: 2_000_000,
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn make_user_position_account(owner: Pubkey, vault: Pubkey, shares: u64, bump: u8) -> Account {
    let mut data = vec![0u8; USER_POSITION_LEN];
    data[0..8].copy_from_slice(UserPosition::DISCRIMINATOR);
    data[8..40].copy_from_slice(owner.as_ref());
    data[40..72].copy_from_slice(vault.as_ref());
    data[72..80].copy_from_slice(&shares.to_le_bytes());
    data[80] = bump;
    Account {
        lamports: 2_000_000,
        data,
        owner: program_id(),
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

fn send(
    svm: &mut LiteSVM,
    instruction: Instruction,
    signers: &[&Keypair],
    payer: &Keypair,
) -> Result<Vec<String>, String> {
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

#[allow(clippy::too_many_arguments)]
fn make_sweep_ix(
    governance: Pubkey,
    protocol_config: Pubkey,
    vault: Pubkey,
    vault_authority: Pubkey,
    custody: Pubkey,
    treasury: Pubkey,
    treasury_token_account: Pubkey,
    mint: Pubkey,
    token_program: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::SweepExcess {}.data(),
        solana_vault_prototype::accounts::SweepExcess {
            protocol_governance_authority: governance,
            protocol_config,
            vault_state: vault,
            vault_authority,
            custody,
            treasury,
            treasury_token_account,
            mint,
            token_program,
        }
        .to_account_metas(None),
    )
}

fn make_raw_spl_transfer_ix(
    source: Pubkey,
    destination: Pubkey,
    authority: Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = vec![3u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: token_program_id(),
        accounts: vec![
            AccountMeta::new(source, false),
            AccountMeta::new(destination, false),
            AccountMeta::new_readonly(authority, true),
        ],
        data,
    }
}

#[allow(clippy::too_many_arguments)]
fn make_withdraw_ix(
    user: Pubkey,
    vault: Pubkey,
    vault_authority: Pubkey,
    custody: Pubkey,
    user_token_account: Pubkey,
    user_position: Pubkey,
    mint: Pubkey,
    shares_in: u64,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Withdraw { shares_in }.data(),
        solana_vault_prototype::accounts::Withdraw {
            user,
            vault_state: vault,
            vault_authority,
            custody,
            user_token_account,
            user_position,
            mint,
            token_program: token_program_id(),
        }
        .to_account_metas(None),
    )
}

fn token_balance(svm: &LiteSVM, address: Pubkey) -> u64 {
    let account = svm.get_account(&address).unwrap();
    u64::from_le_bytes(account.data[64..72].try_into().unwrap())
}

struct Fixture {
    svm: LiteSVM,
    payer: Keypair,
    governance: Keypair,
    mint: Pubkey,
    protocol_config: Pubkey,
    mint_config: Pubkey,
    vault: Pubkey,
    vault_authority: Pubkey,
    custody: Pubkey,
    treasury: Pubkey,
    treasury_token_account: Pubkey,
}

impl Fixture {
    fn new(
        state: OperationalState,
        total_assets: u64,
        total_shares: u64,
        custody_amount: u64,
        treasury_amount: u64,
    ) -> Self {
        let payer = Keypair::new();
        let governance = Keypair::new();
        let mint = Pubkey::new_unique();
        let treasury = Pubkey::new_unique();
        let pause_authority = Pubkey::new_unique();
        let (protocol_config, protocol_bump) = find_protocol_config();
        let (mint_config, mint_config_bump) = find_mint_config(&mint);
        let (vault, vault_bump) = find_vault_state(&mint);
        let (vault_authority, authority_bump) = find_vault_authority(&vault);
        let custody = associated_token_address(&vault_authority, &mint);
        let treasury_token_account = associated_token_address(&treasury, &mint);

        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&governance.pubkey(), 1_000_000_000).unwrap();
        svm.set_account(mint, make_mint_account()).unwrap();
        svm.set_account(
            protocol_config,
            make_protocol_config_account(protocol_bump, keypair_pubkey(&governance), treasury),
        )
        .unwrap();
        svm.set_account(
            mint_config,
            make_mint_config_account(mint, mint_config_bump),
        )
        .unwrap();
        svm.set_account(
            vault,
            make_vault_state_account(
                pause_authority,
                mint,
                vault_bump,
                authority_bump,
                total_assets,
                total_shares,
                state,
            ),
        )
        .unwrap();
        svm.set_account(
            custody,
            make_token_account(&vault_authority, &mint, custody_amount),
        )
        .unwrap();
        svm.set_account(
            treasury_token_account,
            make_token_account(&treasury, &mint, treasury_amount),
        )
        .unwrap();

        Self {
            svm,
            payer,
            governance,
            mint,
            protocol_config,
            mint_config,
            vault,
            vault_authority,
            custody,
            treasury,
            treasury_token_account,
        }
    }

    fn sweep_ix(&self) -> Instruction {
        make_sweep_ix(
            keypair_pubkey(&self.governance),
            self.protocol_config,
            self.vault,
            self.vault_authority,
            self.custody,
            self.treasury,
            self.treasury_token_account,
            self.mint,
            token_program_id(),
        )
    }

    fn send_sweep(&mut self) -> Result<Vec<String>, String> {
        let instruction = self.sweep_ix();
        send(
            &mut self.svm,
            instruction,
            &[&self.payer, &self.governance],
            &self.payer,
        )
    }
}

#[test]
fn test_sweep_exit_only_moves_exact_excess_preserves_state_and_emits_exact_event() {
    let total_assets = 1_000_000u64;
    let excess = 250_000u64;
    let mut fixture = Fixture::new(
        OperationalState::ExitOnly,
        total_assets,
        total_assets,
        total_assets + excess,
        10,
    );
    let mut clock = fixture.svm.get_sysvar::<Clock>();
    clock.slot = 88_001;
    clock.unix_timestamp = 1_760_100_123;
    fixture.svm.set_sysvar(&clock);

    let vault_before = fixture.svm.get_account(&fixture.vault).unwrap().data;
    let protocol_before = fixture
        .svm
        .get_account(&fixture.protocol_config)
        .unwrap()
        .data;
    let mint_config_before = fixture.svm.get_account(&fixture.mint_config).unwrap().data;
    let logs = fixture.send_sweep().unwrap();

    assert_eq!(token_balance(&fixture.svm, fixture.custody), total_assets);
    assert_eq!(
        token_balance(&fixture.svm, fixture.treasury_token_account),
        excess + 10
    );
    assert_eq!(
        fixture.svm.get_account(&fixture.vault).unwrap().data,
        vault_before
    );
    assert_eq!(
        fixture
            .svm
            .get_account(&fixture.protocol_config)
            .unwrap()
            .data,
        protocol_before
    );
    assert_eq!(
        fixture.svm.get_account(&fixture.mint_config).unwrap().data,
        mint_config_before
    );

    let bytes = logs
        .iter()
        .filter_map(|line| line.strip_prefix("Program data: "))
        .filter_map(|encoded| STANDARD.decode(encoded).ok())
        .find(|bytes| bytes.starts_with(ExcessSwept::DISCRIMINATOR))
        .expect("ExcessSwept event missing");
    assert_eq!(bytes.len(), 176);
    assert_eq!(
        Pubkey::new_from_array(bytes[8..40].try_into().unwrap()),
        fixture.vault
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[40..72].try_into().unwrap()),
        fixture.mint
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[72..104].try_into().unwrap()),
        fixture.treasury
    );
    assert_eq!(
        Pubkey::new_from_array(bytes[104..136].try_into().unwrap()),
        keypair_pubkey(&fixture.governance)
    );
    assert_eq!(
        u64::from_le_bytes(bytes[136..144].try_into().unwrap()),
        excess
    );
    assert_eq!(
        u64::from_le_bytes(bytes[144..152].try_into().unwrap()),
        total_assets
    );
    assert_eq!(
        u64::from_le_bytes(bytes[152..160].try_into().unwrap()),
        total_assets
    );
    assert_eq!(
        u64::from_le_bytes(bytes[160..168].try_into().unwrap()),
        clock.slot
    );
    assert_eq!(
        i64::from_le_bytes(bytes[168..176].try_into().unwrap()),
        clock.unix_timestamp
    );
}

#[test]
fn test_sweep_fully_paused_handles_near_u64_boundary() {
    let total_assets = u64::MAX - 7;
    let mut fixture = Fixture::new(OperationalState::FullyPaused, total_assets, 1, u64::MAX, 0);
    fixture.send_sweep().unwrap();
    assert_eq!(token_balance(&fixture.svm, fixture.custody), total_assets);
    assert_eq!(
        token_balance(&fixture.svm, fixture.treasury_token_account),
        7
    );
}

#[test]
fn test_active_zero_excess_and_shortfall_fail_with_specific_errors() {
    let mut active = Fixture::new(OperationalState::Active, 100, 100, 110, 0);
    assert_custom_error(&active.send_sweep().unwrap_err(), 6043);
    assert_eq!(token_balance(&active.svm, active.custody), 110);

    let mut zero = Fixture::new(OperationalState::ExitOnly, 100, 100, 100, 0);
    assert_custom_error(&zero.send_sweep().unwrap_err(), 6042);
    assert_eq!(token_balance(&zero.svm, zero.custody), 100);

    let mut shortfall = Fixture::new(OperationalState::ExitOnly, 101, 101, 100, 0);
    assert_custom_error(&shortfall.send_sweep().unwrap_err(), 6041);
    assert_eq!(token_balance(&shortfall.svm, shortfall.custody), 100);
}

#[test]
fn test_wrong_governance_and_malformed_protocol_config_fail_closed() {
    let mut fixture = Fixture::new(OperationalState::ExitOnly, 100, 100, 110, 0);
    let attacker = Keypair::new();
    fixture
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    let wrong_governance_ix = make_sweep_ix(
        keypair_pubkey(&attacker),
        fixture.protocol_config,
        fixture.vault,
        fixture.vault_authority,
        fixture.custody,
        fixture.treasury,
        fixture.treasury_token_account,
        fixture.mint,
        token_program_id(),
    );
    let error = send(
        &mut fixture.svm,
        wrong_governance_ix,
        &[&fixture.payer, &attacker],
        &fixture.payer,
    )
    .unwrap_err();
    assert_custom_error(&error, 6005);

    for (offset, bytes, expected_error) in [
        (8usize, vec![2u8], 6022u32),
        (138usize, vec![1u8], 6023u32),
        (106usize, system_program_id().to_bytes().to_vec(), 6024u32),
    ] {
        let mut malformed = Fixture::new(OperationalState::ExitOnly, 100, 100, 110, 0);
        let mut account = malformed
            .svm
            .get_account(&malformed.protocol_config)
            .unwrap();
        account.data[offset..offset + bytes.len()].copy_from_slice(&bytes);
        malformed
            .svm
            .set_account(malformed.protocol_config, account)
            .unwrap();
        assert_custom_error(&malformed.send_sweep().unwrap_err(), expected_error);
        assert_eq!(token_balance(&malformed.svm, malformed.custody), 110);
    }
}

#[test]
fn test_unsupported_vault_version_and_foreign_owned_authority_fail_closed() {
    let mut versioned = Fixture::new(OperationalState::ExitOnly, 100, 100, 110, 0);
    let mut vault_account = versioned.svm.get_account(&versioned.vault).unwrap();
    vault_account.data[123] = 2;
    versioned
        .svm
        .set_account(versioned.vault, vault_account)
        .unwrap();
    assert_custom_error(&versioned.send_sweep().unwrap_err(), 6010);

    let mut foreign = Fixture::new(OperationalState::ExitOnly, 100, 100, 110, 0);
    foreign
        .svm
        .set_account(
            foreign.vault_authority,
            Account {
                lamports: 1_000_000,
                data: vec![],
                owner: program_id(),
                executable: false,
                rent_epoch: u64::MAX,
            },
        )
        .unwrap();
    assert_custom_error(&foreign.send_sweep().unwrap_err(), 6007);
    assert_eq!(token_balance(&foreign.svm, foreign.custody), 110);
}

#[test]
fn test_every_substituted_identity_and_destination_fails_without_movement() {
    let mut fixture = Fixture::new(OperationalState::ExitOnly, 100, 100, 110, 7);
    let wrong_custody = Pubkey::new_unique();
    let wrong_treasury_token = Pubkey::new_unique();
    let wrong_mint = Pubkey::new_unique();
    fixture
        .svm
        .set_account(
            wrong_custody,
            make_token_account(&fixture.vault_authority, &fixture.mint, 110),
        )
        .unwrap();
    fixture
        .svm
        .set_account(
            wrong_treasury_token,
            make_token_account(&fixture.treasury, &fixture.mint, 0),
        )
        .unwrap();
    fixture
        .svm
        .set_account(wrong_mint, make_mint_account())
        .unwrap();

    let replacements = [
        (1usize, Pubkey::new_unique(), false, false),
        (2usize, Pubkey::new_unique(), false, false),
        (3usize, Pubkey::new_unique(), false, false),
        (4usize, wrong_custody, false, true),
        (5usize, Pubkey::new_unique(), false, false),
        (6usize, wrong_treasury_token, false, true),
        (7usize, wrong_mint, false, false),
        (8usize, system_program_id(), false, false),
    ];

    let vault_before = fixture.svm.get_account(&fixture.vault).unwrap().data;
    for (index, replacement, is_signer, is_writable) in replacements {
        let mut instruction = fixture.sweep_ix();
        instruction.accounts[index] = AccountMeta {
            pubkey: replacement,
            is_signer,
            is_writable,
        };
        assert!(
            send(
                &mut fixture.svm,
                instruction,
                &[&fixture.payer, &fixture.governance],
                &fixture.payer,
            )
            .is_err(),
            "substitution at account index {index} must fail"
        );
        assert_eq!(token_balance(&fixture.svm, fixture.custody), 110);
        assert_eq!(
            token_balance(&fixture.svm, fixture.treasury_token_account),
            7
        );
        assert_eq!(
            fixture.svm.get_account(&fixture.vault).unwrap().data,
            vault_before
        );
    }
}

#[test]
fn test_destination_overflow_cpi_failure_is_atomic() {
    let mut fixture = Fixture::new(OperationalState::ExitOnly, 100, 100, 101, u64::MAX);
    let vault_before = fixture.svm.get_account(&fixture.vault).unwrap().data;
    assert!(fixture.send_sweep().is_err());
    assert_eq!(token_balance(&fixture.svm, fixture.custody), 101);
    assert_eq!(
        token_balance(&fixture.svm, fixture.treasury_token_account),
        u64::MAX
    );
    assert_eq!(
        fixture.svm.get_account(&fixture.vault).unwrap().data,
        vault_before
    );
}

#[test]
fn test_recovery_then_later_donation_and_full_withdraw_preserve_user_accounting() {
    let deposit = 1_000_000u64;
    let first_donation = 250_000u64;
    let later_donation = 50_000u64;
    let mut fixture = Fixture::new(
        OperationalState::ExitOnly,
        deposit,
        deposit,
        deposit + first_donation,
        0,
    );
    let user = Keypair::new();
    let user_pubkey = keypair_pubkey(&user);
    let user_token_account = associated_token_address(&user_pubkey, &fixture.mint);
    let (user_position, position_bump) = find_user_position(&fixture.vault, &user_pubkey);
    fixture.svm.airdrop(&user.pubkey(), 1_000_000_000).unwrap();
    fixture
        .svm
        .set_account(
            user_token_account,
            make_token_account(&user_pubkey, &fixture.mint, 0),
        )
        .unwrap();
    fixture
        .svm
        .set_account(
            user_position,
            make_user_position_account(user_pubkey, fixture.vault, deposit, position_bump),
        )
        .unwrap();

    let position_before = fixture.svm.get_account(&user_position).unwrap().data;
    fixture.send_sweep().unwrap();
    assert_eq!(
        fixture.svm.get_account(&user_position).unwrap().data,
        position_before,
        "recovery must not change user shares"
    );
    assert_eq!(
        token_balance(&fixture.svm, fixture.treasury_token_account),
        first_donation
    );

    let donor = Keypair::new();
    let donor_pubkey = keypair_pubkey(&donor);
    let donor_token_account = associated_token_address(&donor_pubkey, &fixture.mint);
    fixture.svm.airdrop(&donor.pubkey(), 1_000_000_000).unwrap();
    fixture
        .svm
        .set_account(
            donor_token_account,
            make_token_account(&donor_pubkey, &fixture.mint, later_donation),
        )
        .unwrap();
    send(
        &mut fixture.svm,
        make_raw_spl_transfer_ix(
            donor_token_account,
            fixture.custody,
            donor_pubkey,
            later_donation,
        ),
        &[&fixture.payer, &donor],
        &fixture.payer,
    )
    .unwrap();
    assert_eq!(
        token_balance(&fixture.svm, fixture.custody),
        deposit + later_donation
    );

    fixture.send_sweep().unwrap();
    assert_eq!(token_balance(&fixture.svm, fixture.custody), deposit);
    assert_eq!(
        token_balance(&fixture.svm, fixture.treasury_token_account),
        first_donation + later_donation
    );

    send(
        &mut fixture.svm,
        make_withdraw_ix(
            user_pubkey,
            fixture.vault,
            fixture.vault_authority,
            fixture.custody,
            user_token_account,
            user_position,
            fixture.mint,
            deposit,
        ),
        &[&fixture.payer, &user],
        &fixture.payer,
    )
    .unwrap();

    assert_eq!(token_balance(&fixture.svm, user_token_account), deposit);
    assert_eq!(token_balance(&fixture.svm, fixture.custody), 0);
    let vault_account = fixture.svm.get_account(&fixture.vault).unwrap();
    let vault_state = VaultState::try_deserialize(&mut vault_account.data.as_slice()).unwrap();
    assert_eq!(vault_state.total_assets, 0);
    assert_eq!(vault_state.total_shares, 0);
    let position_account = fixture.svm.get_account(&user_position).unwrap();
    let position = UserPosition::try_deserialize(&mut position_account.data.as_slice()).unwrap();
    assert_eq!(position.shares, 0);
}

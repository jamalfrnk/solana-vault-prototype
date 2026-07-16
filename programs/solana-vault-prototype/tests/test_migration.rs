//! M21 — deterministic same-size VaultState v0-to-v1 migration.

use {
    anchor_lang::{
        solana_program::instruction::Instruction, AccountDeserialize, Discriminator,
        InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_vault_prototype::{
        constants::{VAULT_AUTHORITY_SEED, VAULT_SEED},
        state::{
            OperationalState, OperationalStateReason, VaultState, VAULT_STATE_VERSION_V0,
            VAULT_STATE_VERSION_V1,
        },
    },
};

const VAULT_STATE_LEN: usize = 145;
const LEGACY_VAULT_STATE_LEN: usize = 113;

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}

fn keypair_pubkey(kp: &Keypair) -> Pubkey {
    Pubkey::from(kp.pubkey().to_bytes())
}

fn anchor_pubkey(pk: &Pubkey) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::from(pk.to_bytes())
}

fn find_vault_state(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, mint.as_ref()], &program_id())
}

fn find_vault_authority(vault_state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, vault_state.as_ref()], &program_id())
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

#[derive(Clone)]
struct LegacyFields {
    pause_authority: Pubkey,
    mint: Pubkey,
    pending_pause_authority: Pubkey,
    vault_bump: u8,
    authority_bump: u8,
    total_assets: u64,
    total_shares: u64,
    operational_state: u8,
    version: u8,
    reserved: [u8; 21],
}

impl LegacyFields {
    fn canonical(mint: Pubkey, pause_authority: Pubkey) -> (Pubkey, Self) {
        let (vault_state, vault_bump) = find_vault_state(&mint);
        let (_, authority_bump) = find_vault_authority(&vault_state);
        (
            vault_state,
            Self {
                pause_authority,
                mint,
                pending_pause_authority: Pubkey::new_unique(),
                vault_bump,
                authority_bump,
                total_assets: 42,
                total_shares: 17,
                operational_state: OperationalState::Active as u8,
                version: VAULT_STATE_VERSION_V0,
                reserved: [0; 21],
            },
        )
    }
}

fn vault_state_account(fields: &LegacyFields, len: usize) -> Account {
    let mut data = vec![0u8; len];
    let copy = |data: &mut [u8], start: usize, bytes: &[u8]| {
        if start + bytes.len() <= data.len() {
            data[start..start + bytes.len()].copy_from_slice(bytes);
        }
    };
    copy(&mut data, 0, VaultState::DISCRIMINATOR);
    copy(&mut data, 8, fields.pause_authority.as_ref());
    copy(&mut data, 40, fields.mint.as_ref());
    if data.len() > 72 {
        data[72] = fields.vault_bump;
    }
    if data.len() > 73 {
        data[73] = fields.authority_bump;
    }
    copy(&mut data, 74, &fields.total_assets.to_le_bytes());
    copy(&mut data, 82, &fields.total_shares.to_le_bytes());
    if data.len() > 90 {
        data[90] = fields.operational_state;
    }
    copy(&mut data, 91, fields.pending_pause_authority.as_ref());
    if data.len() > 123 {
        data[123] = fields.version;
    }
    copy(&mut data, 124, &fields.reserved);

    Account {
        lamports: 2_000_000,
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn migrate_ix(vault_state: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::MigrateV0ToV1 {}.data(),
        solana_vault_prototype::accounts::MigrateV0ToV1 { vault_state }.to_account_metas(None),
    )
}

fn pause_ix(pause_authority: Pubkey, vault_state: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Pause {
            reason: OperationalStateReason::IncidentResponse,
        }
        .data(),
        solana_vault_prototype::accounts::Pause {
            pause_authority,
            vault_state,
        }
        .to_account_metas(None),
    )
}

fn send_ok(svm: &mut LiteSVM, ix: Instruction, payer: &Keypair) -> Vec<String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&keypair_pubkey(payer)), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).unwrap().logs
}

fn send_err(svm: &mut LiteSVM, ix: Instruction, payer: &Keypair) -> String {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&keypair_pubkey(payer)), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    format!("{:?}", svm.send_transaction(tx).unwrap_err().err)
}

fn read_vault_state(svm: &LiteSVM, address: &Pubkey) -> VaultState {
    let account = svm.get_account(address).unwrap();
    VaultState::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn assert_custom_error(error: &str, number: u32) {
    assert!(
        error.contains(&format!("Custom({number})")),
        "expected custom error {number}, got {error}"
    );
}

#[test]
fn test_migrate_active_v0_to_v1_is_permissionless_same_size_and_preserves_fields() {
    let payer = Keypair::new();
    let pause_authority = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let (vault_state, fields) = LegacyFields::canonical(mint, pause_authority);
    assert_ne!(keypair_pubkey(&payer), pause_authority);

    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    let logs = send_ok(&mut svm, migrate_ix(vault_state), &payer);
    let account = svm.get_account(&vault_state).unwrap();
    assert_eq!(account.data.len(), VAULT_STATE_LEN);
    assert!(logs.iter().any(|line| line.starts_with("Program data:")));

    let migrated = read_vault_state(&svm, &vault_state);
    assert_eq!(migrated.version, VAULT_STATE_VERSION_V1);
    assert_eq!(migrated.operational_state, OperationalState::Active);
    assert_eq!(migrated.pause_authority, anchor_pubkey(&pause_authority));
    assert_eq!(migrated.mint, anchor_pubkey(&mint));
    assert_eq!(migrated.vault_bump, fields.vault_bump);
    assert_eq!(migrated.authority_bump, fields.authority_bump);
    assert_eq!(migrated.total_assets, fields.total_assets);
    assert_eq!(migrated.total_shares, fields.total_shares);
    assert_eq!(
        migrated.pending_pause_authority,
        anchor_pubkey(&fields.pending_pause_authority)
    );
    assert_eq!(migrated.reserved, [0; 21]);
}

#[test]
fn test_migrate_paused_v0_maps_to_exit_only() {
    let payer = Keypair::new();
    let (vault_state, mut fields) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    fields.operational_state = 1;
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    send_ok(&mut svm, migrate_ix(vault_state), &payer);
    assert_eq!(
        read_vault_state(&svm, &vault_state).operational_state,
        OperationalState::ExitOnly
    );
}

#[test]
fn test_repeat_migration_is_rejected_specifically() {
    let payer = Keypair::new();
    let (vault_state, fields) = LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();
    send_ok(&mut svm, migrate_ix(vault_state), &payer);
    svm.expire_blockhash();

    assert_custom_error(&send_err(&mut svm, migrate_ix(vault_state), &payer), 6011);
}

#[test]
fn test_migration_rejects_nonzero_legacy_reserved_bytes() {
    let payer = Keypair::new();
    let (vault_state, mut fields) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    fields.reserved[4] = 9;
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    assert_custom_error(&send_err(&mut svm, migrate_ix(vault_state), &payer), 6012);
    assert_eq!(read_vault_state(&svm, &vault_state).version, 0);
}

#[test]
fn test_migration_rejects_v0_state_other_than_active_or_exit_only() {
    let payer = Keypair::new();
    let (vault_state, mut fields) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    fields.operational_state = OperationalState::FullyPaused as u8;
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    assert_custom_error(&send_err(&mut svm, migrate_ix(vault_state), &payer), 6013);
}

#[test]
fn test_migration_rejects_unsupported_version() {
    let payer = Keypair::new();
    let (vault_state, mut fields) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    fields.version = 2;
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    assert_custom_error(&send_err(&mut svm, migrate_ix(vault_state), &payer), 6010);
}

#[test]
fn test_migration_rejects_wrong_pda_and_stored_bumps() {
    let payer = Keypair::new();
    let mint = Pubkey::new_unique();
    let (vault_state, fields) = LegacyFields::canonical(mint, Pubkey::new_unique());
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let wrong_address = Pubkey::new_unique();
    svm.set_account(wrong_address, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();
    assert_custom_error(&send_err(&mut svm, migrate_ix(wrong_address), &payer), 6015);

    let mut wrong_vault_bump = fields.clone();
    wrong_vault_bump.vault_bump = wrong_vault_bump.vault_bump.wrapping_sub(1);
    svm.set_account(
        vault_state,
        vault_state_account(&wrong_vault_bump, VAULT_STATE_LEN),
    )
    .unwrap();
    assert_custom_error(&send_err(&mut svm, migrate_ix(vault_state), &payer), 6016);

    let other_mint = Pubkey::new_unique();
    let (other_vault, mut wrong_authority_bump) =
        LegacyFields::canonical(other_mint, Pubkey::new_unique());
    wrong_authority_bump.authority_bump = wrong_authority_bump.authority_bump.wrapping_sub(1);
    svm.set_account(
        other_vault,
        vault_state_account(&wrong_authority_bump, VAULT_STATE_LEN),
    )
    .unwrap();
    assert_custom_error(&send_err(&mut svm, migrate_ix(other_vault), &payer), 6017);
}

#[test]
fn test_migration_rejects_incompatible_lengths() {
    let payer = Keypair::new();
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let (legacy_address, legacy) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    svm.set_account(
        legacy_address,
        vault_state_account(&legacy, LEGACY_VAULT_STATE_LEN),
    )
    .unwrap();
    assert!(
        !send_err(&mut svm, migrate_ix(legacy_address), &payer).is_empty(),
        "113-byte accounts must fail before migration"
    );

    let (oversized_address, oversized) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    svm.set_account(
        oversized_address,
        vault_state_account(&oversized, VAULT_STATE_LEN + 1),
    )
    .unwrap();
    assert_custom_error(
        &send_err(&mut svm, migrate_ix(oversized_address), &payer),
        6014,
    );
}

#[test]
fn test_invalid_serialized_operational_state_fails_closed() {
    let payer = Keypair::new();
    let (vault_state, mut fields) =
        LegacyFields::canonical(Pubkey::new_unique(), Pubkey::new_unique());
    fields.operational_state = 3;
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    assert!(
        !send_err(&mut svm, migrate_ix(vault_state), &payer).is_empty(),
        "unknown enum bytes must not deserialize"
    );
}

#[test]
fn test_ordinary_instruction_rejects_v0_until_migrated() {
    let payer = Keypair::new();
    let pause_authority = Keypair::new();
    let (vault_state, fields) =
        LegacyFields::canonical(Pubkey::new_unique(), keypair_pubkey(&pause_authority));
    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    svm.set_account(vault_state, vault_state_account(&fields, VAULT_STATE_LEN))
        .unwrap();

    let blockhash = svm.latest_blockhash();
    let ix = pause_ix(keypair_pubkey(&pause_authority), vault_state);
    let msg = Message::new_with_blockhash(&[ix], Some(&keypair_pubkey(&payer)), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer, &pause_authority])
            .unwrap();
    let error = format!("{:?}", svm.send_transaction(tx).unwrap_err().err);
    assert_custom_error(&error, 6010);
}

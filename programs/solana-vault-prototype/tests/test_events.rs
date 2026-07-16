/// Event emission tests (M12)
///
/// Each instruction emits an Anchor event after state mutation. These tests
/// prove the emit!() call actually fires by checking for the "Program data: ..."
/// log line litesvm surfaces for sol_log_data (what emit!() compiles down to),
/// without needing full Borsh-decode-and-field-assert complexity.
use {
    anchor_lang::{
        solana_program::instruction::Instruction, AccountDeserialize, InstructionData,
        ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_vault_prototype::{
        constants::{USER_POSITION_SEED, VAULT_AUTHORITY_SEED, VAULT_SEED},
        state::{OperationalState, VaultState},
    },
};

// ---------------------------------------------------------------------------
// Helpers (identical pattern to other test files)
// ---------------------------------------------------------------------------

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}
fn keypair_pubkey(kp: &Keypair) -> Pubkey {
    Pubkey::from(kp.pubkey().to_bytes())
}
fn spl_token_id() -> Pubkey {
    Pubkey::from(anchor_spl::token::ID.to_bytes())
}
fn ata_program_id() -> Pubkey {
    Pubkey::from(anchor_spl::associated_token::ID.to_bytes())
}
fn system_program_id() -> Pubkey {
    Pubkey::from(anchor_lang::system_program::ID.to_bytes())
}

fn make_mint_account(mint_authority: &Pubkey, decimals: u8) -> Account {
    let mut data = vec![0u8; 82];
    data[0] = 1;
    data[4..36].copy_from_slice(mint_authority.as_ref());
    data[44] = decimals;
    data[45] = 1;
    Account {
        lamports: 1_461_600,
        data,
        owner: spl_token_id(),
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
        owner: spl_token_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

fn find_vault_state(mint: &Pubkey, pid: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, mint.as_ref()], pid)
}

fn find_vault_authority(vault_state: &Pubkey, pid: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, vault_state.as_ref()], pid)
}

fn find_user_position(vault_state: &Pubkey, user: &Pubkey, pid: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[USER_POSITION_SEED, vault_state.as_ref(), user.as_ref()],
        pid,
    )
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let tp = spl_token_id();
    let ap = ata_program_id();
    Pubkey::find_program_address(&[owner.as_ref(), tp.as_ref(), mint.as_ref()], &ap).0
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

fn send_ok(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], payer: &Keypair) {
    let blockhash = svm.latest_blockhash();
    let payer_pk = keypair_pubkey(payer);
    let msg = Message::new_with_blockhash(ixs, Some(&payer_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).unwrap();
}

/// Send a transaction and return its logs, asserting it succeeded.
fn send_and_get_logs(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    signers: &[&Keypair],
    payer: &Keypair,
) -> Vec<String> {
    let blockhash = svm.latest_blockhash();
    let payer_pk = keypair_pubkey(payer);
    let msg = Message::new_with_blockhash(ixs, Some(&payer_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    let meta = svm
        .send_transaction(tx)
        .expect("transaction should succeed");
    meta.logs
}

fn assert_event_logged(logs: &[String], context: &str) {
    assert!(
        logs.iter().any(|l| l.starts_with("Program data:")),
        "expected an emitted event log ({context}); got logs: {logs:?}"
    );
}

fn make_initialize_ix(
    payer: Pubkey,
    pause_authority: Pubkey,
    mint: Pubkey,
    vault_state: Pubkey,
    vault_authority: Pubkey,
    custody: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Initialize {}.data(),
        solana_vault_prototype::accounts::Initialize {
            payer,
            pause_authority,
            mint,
            vault_state,
            vault_authority,
            custody,
            token_program: spl_token_id(),
            associated_token_program: ata_program_id(),
            system_program: system_program_id(),
        }
        .to_account_metas(None),
    )
}

#[allow(clippy::too_many_arguments)] // one arg per account in the instruction's Accounts struct
fn make_deposit_ix(
    user: Pubkey,
    vault_state: Pubkey,
    vault_authority: Pubkey,
    custody: Pubkey,
    user_token_account: Pubkey,
    user_position: Pubkey,
    mint: Pubkey,
    amount: u64,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Deposit { amount }.data(),
        solana_vault_prototype::accounts::Deposit {
            user,
            vault_state,
            vault_authority,
            custody,
            user_token_account,
            user_position,
            mint,
            token_program: spl_token_id(),
            system_program: system_program_id(),
        }
        .to_account_metas(None),
    )
}

#[allow(clippy::too_many_arguments)] // one arg per account in the instruction's Accounts struct
fn make_withdraw_ix(
    user: Pubkey,
    vault_state: Pubkey,
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
            vault_state,
            vault_authority,
            custody,
            user_token_account,
            user_position,
            mint,
            token_program: spl_token_id(),
        }
        .to_account_metas(None),
    )
}

fn make_pause_ix(pause_authority: Pubkey, vault_state: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Pause {}.data(),
        solana_vault_prototype::accounts::Pause {
            pause_authority,
            vault_state,
        }
        .to_account_metas(None),
    )
}

fn make_unpause_ix(pause_authority: Pubkey, vault_state: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Unpause {}.data(),
        solana_vault_prototype::accounts::Unpause {
            pause_authority,
            vault_state,
        }
        .to_account_metas(None),
    )
}

// ---------------------------------------------------------------------------
// Fixture: a fully initialized vault ready for deposits
// ---------------------------------------------------------------------------

struct Vault {
    svm: LiteSVM,
    pid: Pubkey,
    payer: Keypair,
    pause_authority: Keypair,
    mint_pk: Pubkey,
    vault_state_pda: Pubkey,
    vault_authority_pda: Pubkey,
    custody_ata: Pubkey,
}

impl Vault {
    fn new() -> Self {
        let pid = program_id();
        let payer = Keypair::new();
        let pause_authority = Keypair::new();
        let ma = Keypair::new();
        let mint_kp = Keypair::new();
        let mint_pk = keypair_pubkey(&mint_kp);

        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(mint_pk, make_mint_account(&keypair_pubkey(&ma), 6))
            .unwrap();

        let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
        let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
        let custody_ata = ata(&vault_authority_pda, &mint_pk);

        let ix = make_initialize_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&pause_authority),
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        );
        send_ok(&mut svm, &[ix], &[&payer, &pause_authority], &payer);

        Self {
            svm,
            pid,
            payer,
            pause_authority,
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_emits_vault_initialized_log() {
    let pid = program_id();
    let payer = Keypair::new();
    let pause_authority = Keypair::new();
    let ma = Keypair::new();
    let mint_kp = Keypair::new();
    let mint_pk = keypair_pubkey(&mint_kp);

    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.set_account(mint_pk, make_mint_account(&keypair_pubkey(&ma), 6))
        .unwrap();

    let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
    let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
    let custody_ata = ata(&vault_authority_pda, &mint_pk);

    let ix = make_initialize_ix(
        keypair_pubkey(&payer),
        keypair_pubkey(&pause_authority),
        mint_pk,
        vault_state_pda,
        vault_authority_pda,
        custody_ata,
    );
    let logs = send_and_get_logs(&mut svm, &[ix], &[&payer, &pause_authority], &payer);
    assert_event_logged(&logs, "VaultInitialized");
}

#[test]
fn test_deposit_emits_deposited_log() {
    let mut v = Vault::new();
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);
    v.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    let amount = 1_000_000u64;
    let user_ata = ata(&user_pk, &v.mint_pk);
    v.svm
        .set_account(user_ata, make_token_account(&user_pk, &v.mint_pk, amount))
        .unwrap();
    let (pos, _) = find_user_position(&v.vault_state_pda, &user_pk, &v.pid);

    let ix = make_deposit_ix(
        user_pk,
        v.vault_state_pda,
        v.vault_authority_pda,
        v.custody_ata,
        user_ata,
        pos,
        v.mint_pk,
        amount,
    );
    let logs = send_and_get_logs(&mut v.svm, &[ix], &[&v.payer, &user], &v.payer);
    assert_event_logged(&logs, "Deposited");
}

#[test]
fn test_withdraw_emits_withdrawn_log() {
    let mut v = Vault::new();
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);
    v.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    let amount = 1_000_000u64;
    let user_ata = ata(&user_pk, &v.mint_pk);
    v.svm
        .set_account(user_ata, make_token_account(&user_pk, &v.mint_pk, amount))
        .unwrap();
    let (pos, _) = find_user_position(&v.vault_state_pda, &user_pk, &v.pid);

    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            user_ata,
            pos,
            v.mint_pk,
            amount,
        )],
        &[&v.payer, &user],
        &v.payer,
    );

    let ix = make_withdraw_ix(
        user_pk,
        v.vault_state_pda,
        v.vault_authority_pda,
        v.custody_ata,
        user_ata,
        pos,
        v.mint_pk,
        amount,
    );
    let logs = send_and_get_logs(&mut v.svm, &[ix], &[&v.payer, &user], &v.payer);
    assert_event_logged(&logs, "Withdrawn");
}

#[test]
fn test_pause_emits_paused_log() {
    let mut v = Vault::new();
    let pa_pk = keypair_pubkey(&v.pause_authority);

    let ix = make_pause_ix(pa_pk, v.vault_state_pda);
    let logs = send_and_get_logs(&mut v.svm, &[ix], &[&v.payer, &v.pause_authority], &v.payer);
    assert_event_logged(&logs, "Paused");

    let acct = v.svm.get_account(&v.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap();
    assert_eq!(vs.operational_state, OperationalState::ExitOnly);
}

#[test]
fn test_unpause_emits_unpaused_log() {
    let mut v = Vault::new();
    let pa_pk = keypair_pubkey(&v.pause_authority);

    send_ok(
        &mut v.svm,
        &[make_pause_ix(pa_pk, v.vault_state_pda)],
        &[&v.payer, &v.pause_authority],
        &v.payer,
    );

    let ix = make_unpause_ix(pa_pk, v.vault_state_pda);
    let logs = send_and_get_logs(&mut v.svm, &[ix], &[&v.payer, &v.pause_authority], &v.payer);
    assert_event_logged(&logs, "Unpaused");

    let acct = v.svm.get_account(&v.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap();
    assert_eq!(vs.operational_state, OperationalState::Active);
}

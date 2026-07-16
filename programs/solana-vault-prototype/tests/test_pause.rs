mod support;

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
        constants::{VAULT_AUTHORITY_SEED, VAULT_SEED},
        state::{OperationalState, OperationalStateReason, VaultState},
    },
};

// ---------------------------------------------------------------------------
// Type / program-ID helpers
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

// ---------------------------------------------------------------------------
// Account layout helpers
// ---------------------------------------------------------------------------

fn make_mint_account(_mint_authority: &Pubkey, decimals: u8) -> Account {
    let mut data = vec![0u8; 82];
    // [0..36] COption::None mint_authority: fixed supply required by M24.
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

// ---------------------------------------------------------------------------
// PDA derivations
// ---------------------------------------------------------------------------

fn find_vault_state(mint: &Pubkey, pid: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, mint.as_ref()], pid)
}

fn find_vault_authority(vault_state: &Pubkey, pid: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, vault_state.as_ref()], pid)
}

fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let token_prog = spl_token_id();
    let ata_prog = ata_program_id();
    Pubkey::find_program_address(
        &[owner.as_ref(), token_prog.as_ref(), mint.as_ref()],
        &ata_prog,
    )
    .0
}

// ---------------------------------------------------------------------------
// SVM / instruction helpers
// ---------------------------------------------------------------------------

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
            protocol_governance_authority: payer,
            protocol_config: support::find_protocol_config().0,
            mint_config: support::find_mint_config(&mint).0,
        }
        .to_account_metas(None),
    )
}

fn make_pause_ix(pause_authority: Pubkey, vault_state: Pubkey) -> Instruction {
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

fn make_unpause_ix(pause_authority: Pubkey, vault_state: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Unpause {
            reason: OperationalStateReason::IncidentResolved,
        }
        .data(),
        solana_vault_prototype::accounts::Unpause {
            pause_authority,
            vault_state,
        }
        .to_account_metas(None),
    )
}

// ---------------------------------------------------------------------------
// Shared fixture: initialized vault
// ---------------------------------------------------------------------------

struct VaultFixture {
    svm: LiteSVM,
    payer: Keypair,
    pause_authority: Keypair,
    vault_state_pda: Pubkey,
}

impl VaultFixture {
    fn new() -> Self {
        let pid = program_id();
        let payer = Keypair::new();
        let pause_authority = Keypair::new();
        let mint_authority = Keypair::new();
        let mint_kp = Keypair::new();

        let mint_pk = keypair_pubkey(&mint_kp);

        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(
            mint_pk,
            make_mint_account(&keypair_pubkey(&mint_authority), 6),
        )
        .unwrap();
        support::install_enabled_test_configs(&mut svm, keypair_pubkey(&payer), mint_pk);

        let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
        let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
        let custody_ata = associated_token_address(&vault_authority_pda, &mint_pk);

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
            payer,
            pause_authority,
            vault_state_pda,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// pause() writes the wire-compatible ExitOnly value. M21 still applies the
/// legacy active-only instruction gates until the next pause milestone.
#[test]
fn test_pause_sets_exit_only() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);

    send_ok(
        &mut f.svm,
        &[make_pause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap();
    assert_eq!(vs.operational_state, OperationalState::ExitOnly);
}

/// unpause() writes Active.
#[test]
fn test_unpause_sets_active() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);

    // Pause first
    send_ok(
        &mut f.svm,
        &[make_pause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    // Then unpause
    send_ok(
        &mut f.svm,
        &[make_unpause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap();
    assert_eq!(vs.operational_state, OperationalState::Active);
}

/// Pausing an already-paused vault is idempotent (second call still succeeds).
#[test]
fn test_pause_idempotent() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);

    send_ok(
        &mut f.svm,
        &[make_pause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
    // Expire the blockhash so the second identical transaction is not rejected as AlreadyProcessed.
    f.svm.expire_blockhash();
    send_ok(
        &mut f.svm,
        &[make_pause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap();
    assert_eq!(vs.operational_state, OperationalState::ExitOnly);
}

/// Unpausing an already-Active vault is also idempotent and observable.
#[test]
fn test_unpause_idempotent() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);

    send_ok(
        &mut f.svm,
        &[make_unpause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
    f.svm.expire_blockhash();
    send_ok(
        &mut f.svm,
        &[make_unpause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap();
    assert_eq!(vs.operational_state, OperationalState::Active);
}

/// Wrong pause_authority must fail.
#[test]
fn test_pause_wrong_authority_fails() {
    let mut f = VaultFixture::new();
    let impostor = Keypair::new();
    let impostor_pk = keypair_pubkey(&impostor);
    f.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();

    let ix = make_pause_ix(impostor_pk, f.vault_state_pda);
    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&impostor_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "wrong authority must be rejected"
    );
}

/// Wrong authority for unpause must fail.
#[test]
fn test_unpause_wrong_authority_fails() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);
    // Pause legitimately first
    send_ok(
        &mut f.svm,
        &[make_pause_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let impostor = Keypair::new();
    let impostor_pk = keypair_pubkey(&impostor);
    f.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();

    let ix = make_unpause_ix(impostor_pk, f.vault_state_pda);
    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&impostor_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "wrong authority must be rejected for unpause"
    );
}

/// The ordinary pause authority cannot downgrade or clear FullyPaused. That
/// state remains under the stronger ProtocolConfig authority introduced next.
#[test]
fn test_pause_authority_cannot_change_fully_paused() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);
    let payer_pk = keypair_pubkey(&f.payer);

    let mut account = f.svm.get_account(&f.vault_state_pda).unwrap();
    account.data[90] = OperationalState::FullyPaused as u8;
    f.svm.set_account(f.vault_state_pda, account).unwrap();

    for ix in [
        make_pause_ix(pa_pk, f.vault_state_pda),
        make_unpause_ix(pa_pk, f.vault_state_pda),
    ] {
        let blockhash = f.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer_pk), &blockhash);
        let tx = VersionedTransaction::try_new(
            VersionedMessage::Legacy(msg),
            &[&f.payer, &f.pause_authority],
        )
        .unwrap();
        assert!(
            f.svm.send_transaction(tx).is_err(),
            "ordinary pause authority must not change FullyPaused"
        );
    }

    let account = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vault_state = VaultState::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(vault_state.operational_state, OperationalState::FullyPaused);
}

/// Borsh enum decoding rejects unbounded reason codes before state mutation.
#[test]
fn test_pause_rejects_unknown_reason_code() {
    let mut f = VaultFixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);
    let payer_pk = keypair_pubkey(&f.payer);
    let mut data = solana_vault_prototype::instruction::Pause {
        reason: OperationalStateReason::IncidentResponse,
    }
    .data();
    data[8] = 4;
    let ix = Instruction::new_with_bytes(
        program_id(),
        &data,
        solana_vault_prototype::accounts::Pause {
            pause_authority: pa_pk,
            vault_state: f.vault_state_pda,
        }
        .to_account_metas(None),
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer_pk), &blockhash);
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(msg),
        &[&f.payer, &f.pause_authority],
    )
    .unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "unknown reason codes must fail closed"
    );

    let account = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vault_state = VaultState::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(vault_state.operational_state, OperationalState::Active);
}

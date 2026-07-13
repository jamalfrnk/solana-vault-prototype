//! M18 — two-step pause-authority rotation.
//!
//! propose_pause_authority: only the current authority may propose; the
//! proposal is inert until accepted. accept_pause_authority: only the
//! proposed key may accept, and it must SIGN — proving the destination is a
//! live key (or a governance program's invoke_signed) before it holds the
//! only pause power. The final test rotates a keypair-run vault INTO an
//! off-curve multisig PDA using the M16 sigverify-off analog — the gap M16
//! documented ("authority is a one-shot initialize-time decision") is closed.

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
        state::VaultState,
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

fn anchor_pubkey(pk: &Pubkey) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::from(pk.to_bytes())
}

// ---------------------------------------------------------------------------
// Account layout helpers
// ---------------------------------------------------------------------------

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
// SVM / transaction helpers
// ---------------------------------------------------------------------------

fn add_program(svm: &mut LiteSVM) {
    svm.add_program(
        program_id(),
        include_bytes!("../../../target/deploy/solana_vault_prototype.so"),
    )
    .unwrap();
}

fn send_ok(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], payer: &Keypair) {
    let blockhash = svm.latest_blockhash();
    let payer_pk = keypair_pubkey(payer);
    let msg = Message::new_with_blockhash(ixs, Some(&payer_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).unwrap();
}

fn send_expect_err(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], payer: &Keypair) {
    let blockhash = svm.latest_blockhash();
    let payer_pk = keypair_pubkey(payer);
    let msg = Message::new_with_blockhash(ixs, Some(&payer_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    assert!(svm.send_transaction(tx).is_err(), "transaction must fail");
}

/// Sigverify-off sender (M16 analog of a governance program's invoke_signed):
/// every account the message marks as a signer is treated as signed.
fn send_with_fabricated_signatures(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer_pk: &Pubkey,
    filler: &Keypair,
) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(payer_pk), &blockhash);
    let n = msg.header.num_required_signatures as usize;
    let msg_bytes = msg.serialize();
    let signatures = (0..n)
        .map(|i| filler.sign_message(&[msg_bytes.as_slice(), &[i as u8]].concat()))
        .collect();
    let tx = VersionedTransaction {
        signatures,
        message: VersionedMessage::Legacy(msg),
    };
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}", e.err))
}

// ---------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------

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

fn make_propose_ix(
    pause_authority: Pubkey,
    vault_state: Pubkey,
    new_authority: &Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::ProposePauseAuthority {
            new_authority: anchor_pubkey(new_authority),
        }
        .data(),
        solana_vault_prototype::accounts::ProposePauseAuthority {
            pause_authority,
            vault_state,
        }
        .to_account_metas(None),
    )
}

fn make_accept_ix(new_pause_authority: Pubkey, vault_state: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::AcceptPauseAuthority {}.data(),
        solana_vault_prototype::accounts::AcceptPauseAuthority {
            new_pause_authority,
            vault_state,
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
// Fixture
// ---------------------------------------------------------------------------

struct Fixture {
    svm: LiteSVM,
    payer: Keypair,
    pause_authority: Keypair,
    vault_state_pda: Pubkey,
}

impl Fixture {
    fn new_with_sigverify(sigverify: bool) -> Self {
        let pid = program_id();
        let payer = Keypair::new();
        let pause_authority = Keypair::new();
        let mint_authority = Keypair::new();
        let mint_kp = Keypair::new();
        let mint_pk = keypair_pubkey(&mint_kp);

        let mut svm = if sigverify {
            LiteSVM::new()
        } else {
            LiteSVM::new().with_sigverify(false)
        };
        add_program(&mut svm);
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(
            mint_pk,
            make_mint_account(&keypair_pubkey(&mint_authority), 6),
        )
        .unwrap();

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

    fn new() -> Self {
        Self::new_with_sigverify(true)
    }

    fn vault_state(&self) -> VaultState {
        let acct = self.svm.get_account(&self.vault_state_pda).unwrap();
        VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// propose() records the pending authority without changing the active one.
#[test]
fn test_propose_records_pending_without_rotating() {
    let mut f = Fixture::new();
    let proposed = Keypair::new();
    let proposed_pk = keypair_pubkey(&proposed);

    send_ok(
        &mut f.svm,
        &[make_propose_ix(
            keypair_pubkey(&f.pause_authority),
            f.vault_state_pda,
            &proposed_pk,
        )],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let vs = f.vault_state();
    assert_eq!(
        Pubkey::from(vs.pending_pause_authority.to_bytes()),
        proposed_pk,
        "pending must record the proposal"
    );
    assert_eq!(
        Pubkey::from(vs.pause_authority.to_bytes()),
        keypair_pubkey(&f.pause_authority),
        "active authority must be unchanged until accepted"
    );

    // The proposal alone grants nothing: the proposed key cannot pause yet.
    f.svm.airdrop(&proposed.pubkey(), 1_000_000_000).unwrap();
    send_expect_err(
        &mut f.svm,
        &[make_pause_ix(proposed_pk, f.vault_state_pda)],
        &[&proposed],
        &proposed,
    );
}

/// Only the current authority may propose.
#[test]
fn test_propose_wrong_authority_fails() {
    let mut f = Fixture::new();
    let impostor = Keypair::new();
    let impostor_pk = keypair_pubkey(&impostor);
    f.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();

    send_expect_err(
        &mut f.svm,
        &[make_propose_ix(
            impostor_pk,
            f.vault_state_pda,
            &impostor_pk,
        )],
        &[&impostor],
        &impostor,
    );
    assert_eq!(
        f.vault_state().pending_pause_authority,
        anchor_lang::prelude::Pubkey::default(),
        "no proposal may be recorded"
    );
}

/// The default (all-zero) pubkey is rejected as a proposal — it is the
/// "no pending" sentinel and would soft-brick acceptance.
#[test]
fn test_propose_rejects_default_pubkey() {
    let mut f = Fixture::new();
    let zero = Pubkey::default();

    send_expect_err(
        &mut f.svm,
        &[make_propose_ix(
            keypair_pubkey(&f.pause_authority),
            f.vault_state_pda,
            &zero,
        )],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
}

/// Re-proposing overwrites the pending authority.
#[test]
fn test_repropose_overwrites_pending() {
    let mut f = Fixture::new();
    let first = keypair_pubkey(&Keypair::new());
    let second = keypair_pubkey(&Keypair::new());
    let pa_pk = keypair_pubkey(&f.pause_authority);

    send_ok(
        &mut f.svm,
        &[make_propose_ix(pa_pk, f.vault_state_pda, &first)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
    send_ok(
        &mut f.svm,
        &[make_propose_ix(pa_pk, f.vault_state_pda, &second)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    assert_eq!(
        Pubkey::from(f.vault_state().pending_pause_authority.to_bytes()),
        second,
        "the second proposal must replace the first"
    );
}

/// Full happy path: propose → accept → the new authority controls pause,
/// the old one is locked out, and pending is cleared.
#[test]
fn test_accept_rotates_authority_end_to_end() {
    let mut f = Fixture::new();
    let new_authority = Keypair::new();
    let new_pk = keypair_pubkey(&new_authority);
    let old_pk = keypair_pubkey(&f.pause_authority);
    f.svm
        .airdrop(&new_authority.pubkey(), 1_000_000_000)
        .unwrap();

    send_ok(
        &mut f.svm,
        &[make_propose_ix(old_pk, f.vault_state_pda, &new_pk)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
    send_ok(
        &mut f.svm,
        &[make_accept_ix(new_pk, f.vault_state_pda)],
        &[&new_authority],
        &new_authority,
    );

    let vs = f.vault_state();
    assert_eq!(Pubkey::from(vs.pause_authority.to_bytes()), new_pk);
    assert_eq!(
        vs.pending_pause_authority,
        anchor_lang::prelude::Pubkey::default(),
        "pending must clear on acceptance"
    );

    // Old authority is locked out.
    send_expect_err(
        &mut f.svm,
        &[make_pause_ix(old_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    // New authority has full pause control.
    send_ok(
        &mut f.svm,
        &[make_pause_ix(new_pk, f.vault_state_pda)],
        &[&new_authority],
        &new_authority,
    );
    assert!(f.vault_state().is_paused);
    send_ok(
        &mut f.svm,
        &[make_unpause_ix(new_pk, f.vault_state_pda)],
        &[&new_authority],
        &new_authority,
    );
    assert!(!f.vault_state().is_paused);
}

/// Nobody but the proposed key may accept — not a stranger, not even the
/// current authority.
#[test]
fn test_accept_wrong_signer_fails() {
    let mut f = Fixture::new();
    let proposed = keypair_pubkey(&Keypair::new());
    let pa_pk = keypair_pubkey(&f.pause_authority);

    send_ok(
        &mut f.svm,
        &[make_propose_ix(pa_pk, f.vault_state_pda, &proposed)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let stranger = Keypair::new();
    let stranger_pk = keypair_pubkey(&stranger);
    f.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    send_expect_err(
        &mut f.svm,
        &[make_accept_ix(stranger_pk, f.vault_state_pda)],
        &[&stranger],
        &stranger,
    );

    // The current authority cannot accept on the proposed key's behalf.
    send_expect_err(
        &mut f.svm,
        &[make_accept_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
}

/// accept() with no pending proposal fails.
#[test]
fn test_accept_without_pending_fails() {
    let mut f = Fixture::new();
    let anyone = Keypair::new();
    let anyone_pk = keypair_pubkey(&anyone);
    f.svm.airdrop(&anyone.pubkey(), 1_000_000_000).unwrap();

    send_expect_err(
        &mut f.svm,
        &[make_accept_ix(anyone_pk, f.vault_state_pda)],
        &[&anyone],
        &anyone,
    );
}

/// Cancel path: the current authority proposes ITSELF, accepts, and the
/// vault is back to no-pending with the authority unchanged.
#[test]
fn test_cancel_by_proposing_current_authority() {
    let mut f = Fixture::new();
    let pa_pk = keypair_pubkey(&f.pause_authority);
    let stale = keypair_pubkey(&Keypair::new());

    // A proposal the authority regrets:
    send_ok(
        &mut f.svm,
        &[make_propose_ix(pa_pk, f.vault_state_pda, &stale)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
    // Cancel by re-proposing self and accepting:
    send_ok(
        &mut f.svm,
        &[make_propose_ix(pa_pk, f.vault_state_pda, &pa_pk)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );
    send_ok(
        &mut f.svm,
        &[make_accept_ix(pa_pk, f.vault_state_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    let vs = f.vault_state();
    assert_eq!(Pubkey::from(vs.pause_authority.to_bytes()), pa_pk);
    assert_eq!(
        vs.pending_pause_authority,
        anchor_lang::prelude::Pubkey::default()
    );
}

/// The M16 gap, closed: a keypair-run vault rotates INTO an off-curve
/// multisig vault PDA. The PDA "signs" acceptance the way a governance
/// program's invoke_signed would (sigverify-off analog), then exercises
/// pause control.
#[test]
fn test_rotate_into_multisig_pda() {
    let mut f = Fixture::new_with_sigverify(false);
    let pa_pk = keypair_pubkey(&f.pause_authority);
    let fake_governance_program = Pubkey::new_unique();
    let multisig_pda =
        Pubkey::find_program_address(&[b"multisig_vault", b"m18"], &fake_governance_program).0;
    assert!(!multisig_pda.is_on_curve());

    // Current keypair authority proposes the multisig PDA (normal signing).
    send_ok(
        &mut f.svm,
        &[make_propose_ix(pa_pk, f.vault_state_pda, &multisig_pda)],
        &[&f.payer, &f.pause_authority],
        &f.payer,
    );

    // The multisig executes acceptance via its program (is_signer privilege).
    let payer_pk = keypair_pubkey(&f.payer);
    send_with_fabricated_signatures(
        &mut f.svm,
        &[make_accept_ix(multisig_pda, f.vault_state_pda)],
        &payer_pk,
        &f.payer,
    )
    .expect("multisig PDA acceptance must succeed");

    let vs = f.vault_state();
    assert_eq!(Pubkey::from(vs.pause_authority.to_bytes()), multisig_pda);

    // And the multisig now controls pause.
    send_with_fabricated_signatures(
        &mut f.svm,
        &[make_pause_ix(multisig_pda, f.vault_state_pda)],
        &payer_pk,
        &f.payer,
    )
    .expect("multisig pause must succeed");
    assert!(f.vault_state().is_paused);
}

/// Both rotation instructions emit their events.
#[test]
fn test_rotation_events_emitted() {
    let mut f = Fixture::new();
    let new_authority = Keypair::new();
    let new_pk = keypair_pubkey(&new_authority);
    f.svm
        .airdrop(&new_authority.pubkey(), 1_000_000_000)
        .unwrap();

    let blockhash = f.svm.latest_blockhash();
    let payer_pk = keypair_pubkey(&f.payer);
    let msg = Message::new_with_blockhash(
        &[make_propose_ix(
            keypair_pubkey(&f.pause_authority),
            f.vault_state_pda,
            &new_pk,
        )],
        Some(&payer_pk),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(msg),
        &[&f.payer, &f.pause_authority],
    )
    .unwrap();
    let meta = f.svm.send_transaction(tx).unwrap();
    assert!(
        meta.logs.iter().any(|l| l.starts_with("Program data:")),
        "propose must emit PauseAuthorityProposed"
    );

    let blockhash = f.svm.latest_blockhash();
    let new_pk_solana = keypair_pubkey(&new_authority);
    let msg = Message::new_with_blockhash(
        &[make_accept_ix(new_pk_solana, f.vault_state_pda)],
        Some(&new_pk_solana),
        &blockhash,
    );
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&new_authority]).unwrap();
    let meta = f.svm.send_transaction(tx).unwrap();
    assert!(
        meta.logs.iter().any(|l| l.starts_with("Program data:")),
        "accept must emit PauseAuthorityRotated"
    );
}

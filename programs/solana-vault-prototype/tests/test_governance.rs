//! M16 — Governance-ready pause authority.
//!
//! Proves the program's `pause_authority` has no hidden on-curve (single-keypair)
//! assumption: every constraint on it is `Signer` + key equality, which an off-curve
//! multisig vault PDA (e.g. Squads) satisfies when its owning program co-signs via
//! `invoke_signed`. LiteSVM cannot deploy Squads itself, so these tests use the
//! faithful analog: `with_sigverify(false)` plus a message that marks the PDA as a
//! signer — exactly the privilege `invoke_signed` grants a PDA in a real CPI. The
//! signature bytes are fabricated and never checked; what the runtime *does* honor
//! is the `is_signer` flag, which is the only thing the program's constraints see.
//!
//! What this deliberately does NOT prove: Squads' own proposal/threshold logic.
//! That is Squads' contract, tested by Squads. The claim under test here is only
//! that THIS program accepts a CPI-signed PDA authority end to end (initialize →
//! pause → unpause) and still rejects everyone else.

use {
    anchor_lang::{
        solana_program::instruction::{AccountMeta, Instruction},
        AccountDeserialize, InstructionData, ToAccountMetas,
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
        state::{OperationalState, VaultState},
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

/// A stand-in for a governance program's vault PDA (e.g. a Squads multisig
/// vault). The owning program's identity is arbitrary — the vault program never
/// inspects it — what matters is that the address is off-curve, so no private
/// key for it can exist.
fn find_multisig_vault_pda() -> Pubkey {
    let fake_governance_program = Pubkey::new_unique();
    Pubkey::find_program_address(&[b"multisig_vault", b"test"], &fake_governance_program).0
}

// ---------------------------------------------------------------------------
// SVM / transaction helpers
// ---------------------------------------------------------------------------

/// Signature verification disabled: lets a message mark an off-curve PDA as a
/// signer without a real signature — the same `is_signer` privilege that
/// `invoke_signed` grants inside a governance program's execute CPI.
fn build_svm_no_sigverify() -> LiteSVM {
    let mut svm = LiteSVM::new().with_sigverify(false);
    svm.add_program(
        program_id(),
        include_bytes!("../../../target/deploy/solana_vault_prototype.so"),
    )
    .unwrap();
    svm
}

/// Sends `ixs` with every account the message lists as a signer treated as
/// signed, real key or not. Signature bytes are fabricated (sigverify is off);
/// they are derived from the message so each distinct transaction stays unique
/// in LiteSVM's replay-protection history.
fn send_with_fabricated_signatures(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer_pk: &Pubkey,
    filler: &Keypair,
) -> Result<(), Box<dyn std::error::Error>> {
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
        .map_err(|e| format!("{:?}", e.err).into())
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
// Shared fixture: vault initialized with a multisig-PDA pause authority
// ---------------------------------------------------------------------------

struct PdaAuthorityFixture {
    svm: LiteSVM,
    payer: Keypair,
    multisig_pda: Pubkey,
    vault_state_pda: Pubkey,
}

impl PdaAuthorityFixture {
    fn new() -> Self {
        let pid = program_id();
        let payer = Keypair::new();
        let mint_authority = Keypair::new();
        let mint_kp = Keypair::new();
        let mint_pk = keypair_pubkey(&mint_kp);

        let multisig_pda = find_multisig_vault_pda();
        assert!(
            !multisig_pda.is_on_curve(),
            "test premise: the governance authority must be off-curve"
        );

        let mut svm = build_svm_no_sigverify();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(
            mint_pk,
            make_mint_account(&keypair_pubkey(&mint_authority), 6),
        )
        .unwrap();

        let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
        let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
        let custody_ata = associated_token_address(&vault_authority_pda, &mint_pk);

        // In production this initialize is itself a governance proposal: the
        // multisig program executes it via CPI, granting the vault PDA signer
        // privilege with invoke_signed. Here that privilege comes from the
        // message's is_signer flag under sigverify-off.
        let ix = make_initialize_ix(
            keypair_pubkey(&payer),
            multisig_pda,
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        );
        send_with_fabricated_signatures(&mut svm, &[ix], &keypair_pubkey(&payer), &payer)
            .expect("initialize with a PDA pause_authority must succeed");

        Self {
            svm,
            payer,
            multisig_pda,
            vault_state_pda,
        }
    }

    fn vault_state(&self) -> VaultState {
        let acct = self.svm.get_account(&self.vault_state_pda).unwrap();
        VaultState::try_deserialize(&mut acct.data.as_slice()).unwrap()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// initialize() accepts an off-curve multisig vault PDA as pause_authority and
/// records it verbatim in vault state.
#[test]
fn test_initialize_accepts_multisig_pda_pause_authority() {
    let f = PdaAuthorityFixture::new();
    let vs = f.vault_state();
    assert_eq!(
        Pubkey::from(vs.pause_authority.to_bytes()),
        f.multisig_pda,
        "vault state must record the PDA authority verbatim"
    );
    assert_eq!(vs.operational_state, OperationalState::Active);
}

/// pause() and unpause() both succeed when the PDA authority carries signer
/// privilege — the on-chain constraint chain (Signer + key equality) is fully
/// satisfiable by a governance program's invoke_signed.
#[test]
fn test_pause_and_unpause_with_multisig_pda_authority() {
    let mut f = PdaAuthorityFixture::new();
    let payer_pk = keypair_pubkey(&f.payer);

    send_with_fabricated_signatures(
        &mut f.svm,
        &[make_pause_ix(f.multisig_pda, f.vault_state_pda)],
        &payer_pk,
        &f.payer,
    )
    .expect("pause with PDA-signer authority must succeed");
    assert_eq!(
        f.vault_state().operational_state,
        OperationalState::ExitOnly,
        "vault should carry the paused-compatible state"
    );

    send_with_fabricated_signatures(
        &mut f.svm,
        &[make_unpause_ix(f.multisig_pda, f.vault_state_pda)],
        &payer_pk,
        &f.payer,
    )
    .expect("unpause with PDA-signer authority must succeed");
    assert_eq!(
        f.vault_state().operational_state,
        OperationalState::Active,
        "vault should be active"
    );
}

/// A keypair impostor (signing for real) cannot pause a vault whose authority
/// is a multisig PDA — the key-equality constraint still rejects it.
#[test]
fn test_pause_with_pda_authority_rejects_keypair_impostor() {
    let mut f = PdaAuthorityFixture::new();
    let impostor = Keypair::new();
    let impostor_pk = keypair_pubkey(&impostor);
    f.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();

    let result = send_with_fabricated_signatures(
        &mut f.svm,
        &[make_pause_ix(impostor_pk, f.vault_state_pda)],
        &impostor_pk,
        &impostor,
    );
    assert!(
        result.is_err(),
        "an impostor keypair must be rejected even under a PDA authority"
    );
    assert_eq!(f.vault_state().operational_state, OperationalState::Active);
}

/// Naming the multisig PDA as pause_authority WITHOUT signer privilege must
/// fail — knowing the governance address is not the same as controlling it.
/// This is the property that makes the multisig threshold meaningful: only an
/// execute CPI that passes the multisig's own checks can produce the
/// invoke_signed privilege this transaction lacks.
#[test]
fn test_pause_rejects_pda_authority_without_signer_privilege() {
    let mut f = PdaAuthorityFixture::new();
    let payer_pk = keypair_pubkey(&f.payer);

    // Hand-build the metas so the PDA is present but is_signer = false.
    let ix = Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Pause {}.data(),
        vec![
            AccountMeta::new_readonly(f.multisig_pda, false),
            AccountMeta::new(f.vault_state_pda, false),
        ],
    );

    let result = send_with_fabricated_signatures(&mut f.svm, &[ix], &payer_pk, &f.payer);
    assert!(
        result.is_err(),
        "the PDA authority without signer privilege must be rejected"
    );
    assert_eq!(f.vault_state().operational_state, OperationalState::Active);
}

/// The initialize-time payer != pause_authority constraint still holds when the
/// authority is a PDA: a payer cannot smuggle itself in as its own authority.
#[test]
fn test_initialize_pda_payer_authority_separation_still_enforced() {
    let pid = program_id();
    let payer = Keypair::new();
    let payer_pk = keypair_pubkey(&payer);
    let mint_authority = Keypair::new();
    let mint_kp = Keypair::new();
    let mint_pk = keypair_pubkey(&mint_kp);

    let mut svm = build_svm_no_sigverify();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.set_account(
        mint_pk,
        make_mint_account(&keypair_pubkey(&mint_authority), 6),
    )
    .unwrap();

    let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
    let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
    let custody_ata = associated_token_address(&vault_authority_pda, &mint_pk);

    // pause_authority == payer must still be rejected, sigverify-off or not.
    let ix = make_initialize_ix(
        payer_pk,
        payer_pk,
        mint_pk,
        vault_state_pda,
        vault_authority_pda,
        custody_ata,
    );
    let result = send_with_fabricated_signatures(&mut svm, &[ix], &payer_pk, &payer);
    assert!(
        result.is_err(),
        "payer doubling as pause_authority must still be rejected"
    );
}

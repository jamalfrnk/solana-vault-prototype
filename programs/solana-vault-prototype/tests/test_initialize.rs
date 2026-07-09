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
// Type helpers — all pubkey types in this project resolve to
// solana_address::Address (2.6.x) under the hood; these helpers make
// conversions explicit where the compiler sees different nominal types.
// ---------------------------------------------------------------------------

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}

fn keypair_pubkey(kp: &Keypair) -> Pubkey {
    // Keypair::pubkey() returns solana_address (2.6.x)::Address which
    // resolves to the same underlying type as solana_pubkey 4.x::Pubkey.
    Pubkey::from(kp.pubkey().to_bytes())
}

/// Convert an anchor_lang Pubkey (solana_pubkey 3.x re-export) to the
/// solana_pubkey 4.x Pubkey used in test helpers.
fn to_pk(pk: anchor_lang::prelude::Pubkey) -> Pubkey {
    Pubkey::from(pk.to_bytes())
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

/// Manually build an 82-byte SPL Token Mint account payload.
/// COption layout: [tag u32 LE][optional 32-byte pubkey]
fn make_mint_account(mint_authority: &Pubkey, decimals: u8) -> Account {
    let mut data = vec![0u8; 82];
    data[0] = 1; // COption::Some tag for mint_authority
    data[4..36].copy_from_slice(mint_authority.as_ref());
    // [36..44] supply = 0 (already zeroed)
    data[44] = decimals;
    data[45] = 1; // is_initialized = true
                  // [46..82] COption::None for freeze_authority (already zeroed)
    Account {
        lamports: 1_461_600,
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

fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let token_prog = spl_token_id();
    let ata_prog = ata_program_id();
    Pubkey::find_program_address(
        &[owner.as_ref(), token_prog.as_ref(), mint.as_ref()],
        &ata_prog,
    )
    .0
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

fn make_init_ix(
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

fn send_ok(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair], payer: &Keypair) {
    let blockhash = svm.latest_blockhash();
    let payer_pk = keypair_pubkey(payer);
    let msg = Message::new_with_blockhash(ixs, Some(&payer_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).unwrap();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Garbage accounts (payer == pause_authority, all PDAs zeroed) must be rejected.
/// This guards against regressions where account constraints are accidentally dropped.
#[test]
fn test_initialize_rejects_bad_accounts() {
    let pid = program_id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    svm.add_program(
        pid,
        include_bytes!("../../../target/deploy/solana_vault_prototype.so"),
    )
    .unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let ix = Instruction::new_with_bytes(
        pid,
        &solana_vault_prototype::instruction::Initialize {}.data(),
        solana_vault_prototype::accounts::Initialize {
            payer: keypair_pubkey(&payer),
            pause_authority: keypair_pubkey(&payer),
            mint: Pubkey::default(),
            vault_state: Pubkey::default(),
            vault_authority: Pubkey::default(),
            custody: Pubkey::default(),
            token_program: spl_token_id(),
            associated_token_program: ata_program_id(),
            system_program: system_program_id(),
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer]).unwrap();
    assert!(
        svm.send_transaction(tx).is_err(),
        "garbage accounts or payer==pause_authority must be rejected"
    );
}

/// VaultState is created with the correct fields and bumps.
#[test]
fn test_vault_initialize_creates_correct_state() {
    let pid = program_id();
    let payer = Keypair::new();
    let pause_authority = Keypair::new();
    let mint_authority = Keypair::new();
    let mint_kp = Keypair::new();

    let mint_pk = keypair_pubkey(&mint_kp);
    let pause_auth_pk = keypair_pubkey(&pause_authority);

    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.set_account(
        mint_pk,
        make_mint_account(&keypair_pubkey(&mint_authority), 6),
    )
    .unwrap();

    let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
    let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
    let custody_ata = associated_token_address(&vault_authority_pda, &mint_pk);

    let ix = make_init_ix(
        keypair_pubkey(&payer),
        pause_auth_pk,
        mint_pk,
        vault_state_pda,
        vault_authority_pda,
        custody_ata,
    );
    send_ok(&mut svm, &[ix], &[&payer, &pause_authority], &payer);

    let acct = svm
        .get_account(&vault_state_pda)
        .expect("vault_state not found");
    let vault_state =
        VaultState::try_deserialize(&mut acct.data.as_slice()).expect("deserialize failed");

    let (_, expected_vault_bump) = find_vault_state(&mint_pk, &pid);
    let (_, expected_authority_bump) = find_vault_authority(&vault_state_pda, &pid);

    assert_eq!(
        to_pk(vault_state.pause_authority),
        pause_auth_pk,
        "pause_authority mismatch"
    );
    assert_eq!(to_pk(vault_state.mint), mint_pk, "mint mismatch");
    assert_eq!(vault_state.total_assets, 0, "total_assets != 0");
    assert_eq!(vault_state.total_shares, 0, "total_shares != 0");
    assert!(!vault_state.is_paused, "should not be paused");
    assert_eq!(
        vault_state.vault_bump, expected_vault_bump,
        "vault_bump mismatch"
    );
    assert_eq!(
        vault_state.authority_bump, expected_authority_bump,
        "authority_bump mismatch"
    );
}

/// Duplicate initialization must fail.
#[test]
fn test_vault_initialize_duplicate_fails() {
    let pid = program_id();
    let payer = Keypair::new();
    let pause_authority = Keypair::new();
    let mint_authority = Keypair::new();
    let mint_kp = Keypair::new();

    let mint_pk = keypair_pubkey(&mint_kp);
    let pause_auth_pk = keypair_pubkey(&pause_authority);

    let mut svm = build_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.set_account(
        mint_pk,
        make_mint_account(&keypair_pubkey(&mint_authority), 6),
    )
    .unwrap();

    let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
    let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
    let custody_ata = associated_token_address(&vault_authority_pda, &mint_pk);

    let ix = || {
        make_init_ix(
            keypair_pubkey(&payer),
            pause_auth_pk,
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        )
    };

    // First init succeeds
    send_ok(&mut svm, &[ix()], &[&payer, &pause_authority], &payer);

    // Second init must fail — vault_state PDA already exists
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix()], Some(&keypair_pubkey(&payer)), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer, &pause_authority])
            .unwrap();
    assert!(
        svm.send_transaction(tx).is_err(),
        "duplicate init should fail"
    );
}

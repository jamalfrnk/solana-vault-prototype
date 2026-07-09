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
        state::{UserPosition, VaultState},
    },
};

// ---------------------------------------------------------------------------
// Type / program-ID helpers (identical pattern to test_initialize.rs)
// ---------------------------------------------------------------------------

fn program_id() -> Pubkey {
    Pubkey::from(solana_vault_prototype::id().to_bytes())
}

fn keypair_pubkey(kp: &Keypair) -> Pubkey {
    Pubkey::from(kp.pubkey().to_bytes())
}

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

// ---------------------------------------------------------------------------
// Account layout helpers
// ---------------------------------------------------------------------------

/// Build an 82-byte SPL Token Mint account (COption layout, is_initialized=true).
fn make_mint_account(mint_authority: &Pubkey, decimals: u8) -> Account {
    let mut data = vec![0u8; 82];
    data[0] = 1; // COption::Some tag for mint_authority
    data[4..36].copy_from_slice(mint_authority.as_ref());
    // [36..44] supply = 0
    data[44] = decimals;
    data[45] = 1; // is_initialized
                  // [46..82] COption::None freeze_authority
    Account {
        lamports: 1_461_600,
        data,
        owner: spl_token_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

/// Build a 165-byte SPL Token Account (TokenAccount) with a given owner and mint.
/// SPL TokenAccount packed layout (165 bytes):
///   [0..32]    mint
///   [32..64]   owner
///   [64..72]   amount  (u64 LE)
///   [72..108]  delegate COption<Pubkey>  (4-byte tag + 32-byte data = 36 bytes; zeroed = None)
///   [108]      state   AccountState (0=Uninit, 1=Init, 2=Frozen)
///   [109..121] is_native COption<u64>   (4+8=12; zeroed = None = non-native)
///   [121..129] delegated_amount (u64 LE)
///   [129..165] close_authority COption<Pubkey> (4+32=36; zeroed = None)
fn make_token_account(owner: &Pubkey, mint: &Pubkey, amount: u64) -> Account {
    let mut data = vec![0u8; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1; // state = AccountState::Initialized
    Account {
        lamports: 2_039_280,
        data,
        owner: spl_token_id(),
        executable: false,
        rent_epoch: u64::MAX,
    }
}

// ---------------------------------------------------------------------------
// PDA / ATA derivations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared fixture: an initialized vault ready for deposit tests.
// ---------------------------------------------------------------------------

struct VaultFixture {
    svm: LiteSVM,
    pid: Pubkey,
    payer: Keypair,
    _pause_authority: Keypair,
    mint_pk: Pubkey,
    vault_state_pda: Pubkey,
    vault_authority_pda: Pubkey,
    custody_ata: Pubkey,
}

impl VaultFixture {
    fn new() -> Self {
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

        let ix = make_initialize_ix(
            keypair_pubkey(&payer),
            pause_auth_pk,
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
            _pause_authority: pause_authority,
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

/// First deposit: 1:1 share issuance, VaultState fields updated.
#[test]
fn test_deposit_first_deposit_one_to_one() {
    let mut f = VaultFixture::new();
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);

    f.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    let user_ata = associated_token_address(&user_pk, &f.mint_pk);
    let deposit_amount: u64 = 1_000_000; // 1 token (6 decimals)

    // Inject a funded user token account
    f.svm
        .set_account(
            user_ata,
            make_token_account(&user_pk, &f.mint_pk, deposit_amount),
        )
        .unwrap();

    let (user_position_pda, _) = find_user_position(&f.vault_state_pda, &user_pk, &f.pid);

    let ix = make_deposit_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        user_ata,
        user_position_pda,
        f.mint_pk,
        deposit_amount,
    );
    send_ok(&mut f.svm, &[ix], &[&f.payer, &user], &f.payer);

    // Assert VaultState
    let vs_acct = f
        .svm
        .get_account(&f.vault_state_pda)
        .expect("vault_state not found");
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).expect("deser failed");
    assert_eq!(vs.total_assets, deposit_amount, "total_assets mismatch");
    assert_eq!(
        vs.total_shares, deposit_amount,
        "total_shares mismatch (first deposit 1:1)"
    );

    // Assert UserPosition
    let up_acct = f
        .svm
        .get_account(&user_position_pda)
        .expect("user_position not found");
    let up = UserPosition::try_deserialize(&mut up_acct.data.as_slice()).expect("deser failed");
    assert_eq!(to_pk(up.owner), user_pk, "owner mismatch");
    assert_eq!(to_pk(up.vault), f.vault_state_pda, "vault mismatch");
    assert_eq!(
        up.shares, deposit_amount,
        "shares mismatch (first deposit 1:1)"
    );
}

/// Second deposit: proportional share issuance.
#[test]
fn test_deposit_second_deposit_proportional() {
    let mut f = VaultFixture::new();
    let user_a = Keypair::new();
    let user_b = Keypair::new();
    let user_a_pk = keypair_pubkey(&user_a);
    let user_b_pk = keypair_pubkey(&user_b);

    f.svm.airdrop(&user_a.pubkey(), 10_000_000_000).unwrap();
    f.svm.airdrop(&user_b.pubkey(), 10_000_000_000).unwrap();

    let amount_a: u64 = 1_000_000; // 1 token
    let amount_b: u64 = 2_000_000; // 2 tokens

    let user_a_ata = associated_token_address(&user_a_pk, &f.mint_pk);
    let user_b_ata = associated_token_address(&user_b_pk, &f.mint_pk);

    f.svm
        .set_account(
            user_a_ata,
            make_token_account(&user_a_pk, &f.mint_pk, amount_a),
        )
        .unwrap();
    f.svm
        .set_account(
            user_b_ata,
            make_token_account(&user_b_pk, &f.mint_pk, amount_b),
        )
        .unwrap();

    let (pos_a, _) = find_user_position(&f.vault_state_pda, &user_a_pk, &f.pid);
    let (pos_b, _) = find_user_position(&f.vault_state_pda, &user_b_pk, &f.pid);

    // First deposit by user_a
    let ix_a = make_deposit_ix(
        user_a_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        user_a_ata,
        pos_a,
        f.mint_pk,
        amount_a,
    );
    send_ok(&mut f.svm, &[ix_a], &[&f.payer, &user_a], &f.payer);

    // Second deposit by user_b — total_assets = 1_000_000, total_shares = 1_000_000
    // shares_out = floor(2_000_000 * 1_000_000 / 1_000_000) = 2_000_000
    let ix_b = make_deposit_ix(
        user_b_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        user_b_ata,
        pos_b,
        f.mint_pk,
        amount_b,
    );
    send_ok(&mut f.svm, &[ix_b], &[&f.payer, &user_b], &f.payer);

    let vs_acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(vs.total_assets, amount_a + amount_b, "total_assets");
    assert_eq!(
        vs.total_shares,
        amount_a + amount_b,
        "total_shares (same price per share)"
    );

    let up_acct = f.svm.get_account(&pos_b).unwrap();
    let up = UserPosition::try_deserialize(&mut up_acct.data.as_slice()).unwrap();
    assert_eq!(
        up.shares, amount_b,
        "user_b shares should equal amount_b at 1:1 price"
    );
}

/// Deposit of zero must fail.
#[test]
fn test_deposit_zero_amount_fails() {
    let mut f = VaultFixture::new();
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);

    f.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    let user_ata = associated_token_address(&user_pk, &f.mint_pk);
    f.svm
        .set_account(
            user_ata,
            make_token_account(&user_pk, &f.mint_pk, 1_000_000),
        )
        .unwrap();

    let (pos, _) = find_user_position(&f.vault_state_pda, &user_pk, &f.pid);

    let ix = make_deposit_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        user_ata,
        pos,
        f.mint_pk,
        0,
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "zero deposit must fail"
    );
}

/// Deposit into a paused vault must fail.
#[test]
fn test_deposit_paused_vault_fails() {
    let mut f = VaultFixture::new();

    // Pause the vault via raw byte mutation (pause instruction arrives in M7).
    // VaultState Borsh layout: [8 disc][32 pause_auth][32 mint][1 vault_bump]
    // [1 auth_bump][8 total_assets][8 total_shares][1 is_paused] → offset 90.
    let mut vs_acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    vs_acct.data[90] = 1; // is_paused = true
    f.svm.set_account(f.vault_state_pda, vs_acct).unwrap();

    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);
    f.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    let user_ata = associated_token_address(&user_pk, &f.mint_pk);
    f.svm
        .set_account(
            user_ata,
            make_token_account(&user_pk, &f.mint_pk, 1_000_000),
        )
        .unwrap();

    let (pos, _) = find_user_position(&f.vault_state_pda, &user_pk, &f.pid);

    let ix = make_deposit_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        user_ata,
        pos,
        f.mint_pk,
        500_000,
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "deposit into paused vault must fail"
    );
}

/// Wrong mint token account must be rejected.
#[test]
fn test_deposit_wrong_mint_fails() {
    let mut f = VaultFixture::new();
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);
    f.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    // Create a different mint
    let other_mint_kp = Keypair::new();
    let other_mint_pk = keypair_pubkey(&other_mint_kp);
    let other_mint_authority = Keypair::new();
    f.svm
        .set_account(
            other_mint_pk,
            make_mint_account(&keypair_pubkey(&other_mint_authority), 6),
        )
        .unwrap();

    // User token account for the OTHER mint
    let wrong_user_ata = associated_token_address(&user_pk, &other_mint_pk);
    f.svm
        .set_account(
            wrong_user_ata,
            make_token_account(&user_pk, &other_mint_pk, 1_000_000),
        )
        .unwrap();

    let (pos, _) = find_user_position(&f.vault_state_pda, &user_pk, &f.pid);

    let ix = make_deposit_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        wrong_user_ata,
        pos,
        f.mint_pk,
        500_000,
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "wrong-mint token account must be rejected"
    );
}

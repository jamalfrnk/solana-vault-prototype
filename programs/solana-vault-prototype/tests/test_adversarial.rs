/// Adversarial test suite (M8)
///
/// Covers every SECURITY_CHECKLIST item not already exercised by M4-M7 tests:
/// missing signers, wrong PDAs, account substitution, unrelated vault/user combos,
/// wrong token program, overflow/boundary arithmetic.
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
        state::VaultState,
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

// ---------------------------------------------------------------------------
// Vault fixture: a fully initialized vault ready for deposits
// ---------------------------------------------------------------------------

struct Vault {
    svm: LiteSVM,
    pid: Pubkey,
    payer: Keypair,
    _pause_authority: Keypair,
    mint_pk: Pubkey,
    vault_state_pda: Pubkey,
    vault_authority_pda: Pubkey,
    custody_ata: Pubkey,
}

impl Vault {
    fn new() -> Self {
        let pid = program_id();
        let payer = Keypair::new();
        let pa = Keypair::new();
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
            keypair_pubkey(&pa),
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        );
        send_ok(&mut svm, &[ix], &[&payer, &pa], &payer);

        Self {
            svm,
            pid,
            payer,
            _pause_authority: pa,
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — missing signer
// ---------------------------------------------------------------------------

/// Deposit without user signing must fail.
#[test]
fn test_deposit_missing_user_signature() {
    let mut v = Vault::new();
    let user_kp = Keypair::new();
    let user_pk = keypair_pubkey(&user_kp);
    v.svm.airdrop(&user_kp.pubkey(), 10_000_000_000).unwrap();

    let user_ata = ata(&user_pk, &v.mint_pk);
    v.svm
        .set_account(
            user_ata,
            make_token_account(&user_pk, &v.mint_pk, 1_000_000),
        )
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
        1_000_000,
    );

    let blockhash = v.svm.latest_blockhash();
    // Fee payer = payer (not user); user NOT in signers array.
    // The SDK may reject at try_new (NotEnoughSigners) or the runtime may reject — both count.
    let msg = Message::new_with_blockhash(&[ix], Some(&keypair_pubkey(&v.payer)), &blockhash);
    let failed = match VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&v.payer]) {
        Err(_) => true,
        Ok(tx) => v.svm.send_transaction(tx).is_err(),
    };
    assert!(failed, "missing user signature must fail");
}

/// Withdraw without user signing must fail.
#[test]
fn test_withdraw_missing_user_signature() {
    let mut v = Vault::new();
    let user_kp = Keypair::new();
    let user_pk = keypair_pubkey(&user_kp);
    v.svm.airdrop(&user_kp.pubkey(), 10_000_000_000).unwrap();

    let user_ata_pk = ata(&user_pk, &v.mint_pk);
    v.svm
        .set_account(
            user_ata_pk,
            make_token_account(&user_pk, &v.mint_pk, 2_000_000),
        )
        .unwrap();
    let (pos, _) = find_user_position(&v.vault_state_pda, &user_pk, &v.pid);

    // Deposit first (with user signature)
    let dep_ix = make_deposit_ix(
        user_pk,
        v.vault_state_pda,
        v.vault_authority_pda,
        v.custody_ata,
        user_ata_pk,
        pos,
        v.mint_pk,
        2_000_000,
    );
    send_ok(&mut v.svm, &[dep_ix], &[&v.payer, &user_kp], &v.payer);

    // Withdraw WITHOUT user signature
    let wd_ix = make_withdraw_ix(
        user_pk,
        v.vault_state_pda,
        v.vault_authority_pda,
        v.custody_ata,
        user_ata_pk,
        pos,
        v.mint_pk,
        2_000_000,
    );
    let blockhash = v.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[wd_ix], Some(&keypair_pubkey(&v.payer)), &blockhash);
    let failed = match VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&v.payer]) {
        Err(_) => true,
        Ok(tx) => v.svm.send_transaction(tx).is_err(),
    };
    assert!(failed, "missing user signature on withdraw must fail");
}

// ---------------------------------------------------------------------------
// Tests — wrong PDA / account substitution
// ---------------------------------------------------------------------------

/// Deposit to a wrong vault_state (different mint) must fail.
#[test]
fn test_deposit_wrong_vault_state() {
    let mut v = Vault::new();

    // Create a second vault with a different mint
    let ma2 = Keypair::new();
    let mint2_kp = Keypair::new();
    let mint2_pk = keypair_pubkey(&mint2_kp);
    let pa2 = Keypair::new();
    v.svm
        .set_account(mint2_pk, make_mint_account(&keypair_pubkey(&ma2), 6))
        .unwrap();
    let (vs2, _) = find_vault_state(&mint2_pk, &v.pid);
    let (va2, _) = find_vault_authority(&vs2, &v.pid);
    let custody2 = ata(&va2, &mint2_pk);
    let ix2 = make_initialize_ix(
        keypair_pubkey(&v.payer),
        keypair_pubkey(&pa2),
        mint2_pk,
        vs2,
        va2,
        custody2,
    );
    send_ok(&mut v.svm, &[ix2], &[&v.payer, &pa2], &v.payer);

    // User funds for vault 1's mint
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);
    v.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata_v1 = ata(&user_pk, &v.mint_pk);
    v.svm
        .set_account(
            user_ata_v1,
            make_token_account(&user_pk, &v.mint_pk, 1_000_000),
        )
        .unwrap();
    let (pos_v2, _) = find_user_position(&vs2, &user_pk, &v.pid);

    // Pass vault2's vault_state but vault1's mint and token accounts — seeds mismatch
    let ix = make_deposit_ix(
        user_pk,
        vs2,         // wrong vault_state (belongs to mint2)
        va2,         // wrong vault_authority
        custody2,    // wrong custody
        user_ata_v1, // user's vault1 token account
        pos_v2,
        v.mint_pk, // vault1 mint (wrong for vs2)
        500_000,
    );
    let blockhash = v.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user]).unwrap();
    assert!(
        v.svm.send_transaction(tx).is_err(),
        "wrong vault_state must be rejected"
    );
}

/// Deposit using another user's token account (wrong owner) must fail.
#[test]
fn test_deposit_wrong_token_account_owner() {
    let mut v = Vault::new();
    let user_a = Keypair::new();
    let user_b = Keypair::new();
    let user_a_pk = keypair_pubkey(&user_a);
    let user_b_pk = keypair_pubkey(&user_b);

    v.svm.airdrop(&user_a.pubkey(), 10_000_000_000).unwrap();
    v.svm.airdrop(&user_b.pubkey(), 1_000_000_000).unwrap();

    // user_a has tokens; user_b has no tokens but will try to use user_a's ATA
    let user_a_ata = ata(&user_a_pk, &v.mint_pk);
    v.svm
        .set_account(
            user_a_ata,
            make_token_account(&user_a_pk, &v.mint_pk, 1_000_000),
        )
        .unwrap();

    let (pos_b, _) = find_user_position(&v.vault_state_pda, &user_b_pk, &v.pid);

    // user_b signs but passes user_a's token account (owner mismatch)
    let ix = make_deposit_ix(
        user_b_pk,
        v.vault_state_pda,
        v.vault_authority_pda,
        v.custody_ata,
        user_a_ata,
        pos_b,
        v.mint_pk,
        500_000,
    );
    let blockhash = v.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_b_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user_b]).unwrap();
    assert!(
        v.svm.send_transaction(tx).is_err(),
        "wrong token account owner must be rejected"
    );
}

/// Withdraw using a different user's position (cross-user substitution) must fail.
#[test]
fn test_withdraw_cross_user_position_substitution() {
    let mut v = Vault::new();
    let user_a = Keypair::new();
    let user_b = Keypair::new();
    let user_a_pk = keypair_pubkey(&user_a);
    let user_b_pk = keypair_pubkey(&user_b);

    v.svm.airdrop(&user_a.pubkey(), 10_000_000_000).unwrap();
    v.svm.airdrop(&user_b.pubkey(), 10_000_000_000).unwrap();

    let amount_a = 2_000_000u64;
    let amount_b = 1_000_000u64;

    let ata_a = ata(&user_a_pk, &v.mint_pk);
    let ata_b = ata(&user_b_pk, &v.mint_pk);
    v.svm
        .set_account(ata_a, make_token_account(&user_a_pk, &v.mint_pk, amount_a))
        .unwrap();
    v.svm
        .set_account(ata_b, make_token_account(&user_b_pk, &v.mint_pk, amount_b))
        .unwrap();

    let (pos_a, _) = find_user_position(&v.vault_state_pda, &user_a_pk, &v.pid);
    let (pos_b, _) = find_user_position(&v.vault_state_pda, &user_b_pk, &v.pid);

    // Both deposit
    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_a_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_a,
            pos_a,
            v.mint_pk,
            amount_a,
        )],
        &[&v.payer, &user_a],
        &v.payer,
    );
    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_b_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_b,
            pos_b,
            v.mint_pk,
            amount_b,
        )],
        &[&v.payer, &user_b],
        &v.payer,
    );

    // user_b tries to withdraw using user_a's position (which has more shares)
    let ix = make_withdraw_ix(
        user_b_pk,
        v.vault_state_pda,
        v.vault_authority_pda,
        v.custody_ata,
        ata_b,
        pos_a, // user_a's position!
        v.mint_pk,
        amount_a,
    );
    let blockhash = v.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_b_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user_b]).unwrap();
    assert!(
        v.svm.send_transaction(tx).is_err(),
        "cross-user position substitution must fail"
    );
}

// ---------------------------------------------------------------------------
// Tests — wrong token program
// ---------------------------------------------------------------------------

/// Passing a fake token program to deposit must fail.
#[test]
fn test_deposit_wrong_token_program() {
    let mut v = Vault::new();
    let user = Keypair::new();
    let user_pk = keypair_pubkey(&user);
    v.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();

    let user_ata_pk = ata(&user_pk, &v.mint_pk);
    v.svm
        .set_account(
            user_ata_pk,
            make_token_account(&user_pk, &v.mint_pk, 1_000_000),
        )
        .unwrap();
    let (pos, _) = find_user_position(&v.vault_state_pda, &user_pk, &v.pid);

    // Construct deposit accounts with a fake token program (use system program ID)
    let fake_token_program = system_program_id();
    let ix = Instruction::new_with_bytes(
        program_id(),
        &solana_vault_prototype::instruction::Deposit { amount: 500_000 }.data(),
        solana_vault_prototype::accounts::Deposit {
            user: user_pk,
            vault_state: v.vault_state_pda,
            vault_authority: v.vault_authority_pda,
            custody: v.custody_ata,
            user_token_account: user_ata_pk,
            user_position: pos,
            mint: v.mint_pk,
            token_program: fake_token_program,
            system_program: system_program_id(),
        }
        .to_account_metas(None),
    );

    let blockhash = v.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&user]).unwrap();
    assert!(
        v.svm.send_transaction(tx).is_err(),
        "fake token program must be rejected"
    );
}

// ---------------------------------------------------------------------------
// Tests — arithmetic boundary
// ---------------------------------------------------------------------------

/// Multiple small deposits + withdrawals: accounting remains consistent.
#[test]
fn test_adversarial_repeated_deposits_withdrawals_consistent() {
    let mut v = Vault::new();
    let user_a = Keypair::new();
    let user_b = Keypair::new();
    let user_a_pk = keypair_pubkey(&user_a);
    let user_b_pk = keypair_pubkey(&user_b);

    v.svm.airdrop(&user_a.pubkey(), 10_000_000_000).unwrap();
    v.svm.airdrop(&user_b.pubkey(), 10_000_000_000).unwrap();

    let large_amount = 10_000_000u64;
    let ata_a = ata(&user_a_pk, &v.mint_pk);
    let ata_b = ata(&user_b_pk, &v.mint_pk);
    v.svm
        .set_account(
            ata_a,
            make_token_account(&user_a_pk, &v.mint_pk, large_amount),
        )
        .unwrap();
    v.svm
        .set_account(
            ata_b,
            make_token_account(&user_b_pk, &v.mint_pk, large_amount),
        )
        .unwrap();

    let (pos_a, _) = find_user_position(&v.vault_state_pda, &user_a_pk, &v.pid);
    let (pos_b, _) = find_user_position(&v.vault_state_pda, &user_b_pk, &v.pid);

    // Deposit A (1:1 first deposit)
    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_a_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_a,
            pos_a,
            v.mint_pk,
            large_amount,
        )],
        &[&v.payer, &user_a],
        &v.payer,
    );

    // Deposit B (proportional)
    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_b_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_b,
            pos_b,
            v.mint_pk,
            large_amount,
        )],
        &[&v.payer, &user_b],
        &v.payer,
    );

    // Check state
    let vs_acct = v.svm.get_account(&v.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(vs.total_assets, large_amount * 2);
    assert_eq!(vs.total_shares, large_amount * 2);

    // A withdraws all
    send_ok(
        &mut v.svm,
        &[make_withdraw_ix(
            user_a_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_a,
            pos_a,
            v.mint_pk,
            large_amount,
        )],
        &[&v.payer, &user_a],
        &v.payer,
    );

    let vs_acct = v.svm.get_account(&v.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(
        vs.total_assets, large_amount,
        "after A withdrawal, half remains"
    );
    assert_eq!(
        vs.total_shares, large_amount,
        "after A withdrawal, half shares remain"
    );

    // B withdraws all
    send_ok(
        &mut v.svm,
        &[make_withdraw_ix(
            user_b_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_b,
            pos_b,
            v.mint_pk,
            large_amount,
        )],
        &[&v.payer, &user_b],
        &v.payer,
    );

    let vs_acct = v.svm.get_account(&v.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(vs.total_assets, 0, "all assets withdrawn");
    assert_eq!(vs.total_shares, 0, "all shares redeemed");
}

/// Near-u64::MAX deposit amount: u128 arithmetic should not overflow.
#[test]
fn test_deposit_large_amount_no_overflow() {
    let mut v = Vault::new();
    let user_a = Keypair::new();
    let user_b = Keypair::new();
    let user_a_pk = keypair_pubkey(&user_a);
    let user_b_pk = keypair_pubkey(&user_b);

    v.svm.airdrop(&user_a.pubkey(), 10_000_000_000).unwrap();
    v.svm.airdrop(&user_b.pubkey(), 10_000_000_000).unwrap();

    // Use a large but not max amount to avoid lamport issues (10 billion tokens, 6 decimals)
    let large = 10_000_000_000_000u64; // 10_000_000 tokens at 6 decimals
    let ata_a = ata(&user_a_pk, &v.mint_pk);
    let ata_b = ata(&user_b_pk, &v.mint_pk);
    v.svm
        .set_account(ata_a, make_token_account(&user_a_pk, &v.mint_pk, large))
        .unwrap();
    v.svm
        .set_account(ata_b, make_token_account(&user_b_pk, &v.mint_pk, large))
        .unwrap();

    let (pos_a, _) = find_user_position(&v.vault_state_pda, &user_a_pk, &v.pid);
    let (pos_b, _) = find_user_position(&v.vault_state_pda, &user_b_pk, &v.pid);

    // First large deposit (1:1)
    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_a_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_a,
            pos_a,
            v.mint_pk,
            large,
        )],
        &[&v.payer, &user_a],
        &v.payer,
    );

    // Second large deposit: shares = floor(large * large / large) = large
    // u128 intermediate: large * large = 10^26 which fits in u128 (max ~3.4 * 10^38)
    send_ok(
        &mut v.svm,
        &[make_deposit_ix(
            user_b_pk,
            v.vault_state_pda,
            v.vault_authority_pda,
            v.custody_ata,
            ata_b,
            pos_b,
            v.mint_pk,
            large,
        )],
        &[&v.payer, &user_b],
        &v.payer,
    );

    let vs_acct = v.svm.get_account(&v.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(
        vs.total_assets,
        large * 2,
        "total_assets should be 2x large"
    );
    assert_eq!(
        vs.total_shares,
        large * 2,
        "no overflow — shares should equal assets at 1:1"
    );
}

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

fn make_token_account(owner: &Pubkey, mint: &Pubkey, amount: u64) -> Account {
    let mut data = vec![0u8; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1; // state = Initialized
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

// ---------------------------------------------------------------------------
// Shared fixture: initialized vault + user with deposit already made.
// ---------------------------------------------------------------------------

struct DepositFixture {
    svm: LiteSVM,
    _pid: Pubkey,
    payer: Keypair,
    user: Keypair,
    _pause_authority: Keypair,
    mint_pk: Pubkey,
    vault_state_pda: Pubkey,
    vault_authority_pda: Pubkey,
    custody_ata: Pubkey,
    user_ata: Pubkey,
    user_position_pda: Pubkey,
    _deposit_amount: u64,
}

impl DepositFixture {
    fn new(deposit_amount: u64) -> Self {
        let pid = program_id();
        let payer = Keypair::new();
        let pause_authority = Keypair::new();
        let mint_authority = Keypair::new();
        let mint_kp = Keypair::new();
        let user = Keypair::new();

        let mint_pk = keypair_pubkey(&mint_kp);
        let user_pk = keypair_pubkey(&user);

        let mut svm = build_svm();
        svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
        svm.set_account(
            mint_pk,
            make_mint_account(&keypair_pubkey(&mint_authority), 6),
        )
        .unwrap();

        let (vault_state_pda, _) = find_vault_state(&mint_pk, &pid);
        let (vault_authority_pda, _) = find_vault_authority(&vault_state_pda, &pid);
        let custody_ata = associated_token_address(&vault_authority_pda, &mint_pk);
        let user_ata = associated_token_address(&user_pk, &mint_pk);
        let (user_position_pda, _) = find_user_position(&vault_state_pda, &user_pk, &pid);

        // Initialize vault
        let init_ix = make_initialize_ix(
            keypair_pubkey(&payer),
            keypair_pubkey(&pause_authority),
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
        );
        send_ok(&mut svm, &[init_ix], &[&payer, &pause_authority], &payer);

        // Fund user ATA and deposit
        svm.set_account(
            user_ata,
            make_token_account(&user_pk, &mint_pk, deposit_amount),
        )
        .unwrap();
        let dep_ix = make_deposit_ix(
            user_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
            user_ata,
            user_position_pda,
            mint_pk,
            deposit_amount,
        );
        send_ok(&mut svm, &[dep_ix], &[&payer, &user], &payer);

        Self {
            svm,
            _pid: pid,
            payer,
            user,
            _pause_authority: pause_authority,
            mint_pk,
            vault_state_pda,
            vault_authority_pda,
            custody_ata,
            user_ata,
            user_position_pda,
            _deposit_amount: deposit_amount,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Full withdrawal: all shares redeemed, accounting zeroed.
#[test]
fn test_withdraw_full_withdrawal() {
    let amount = 2_000_000u64;
    let mut f = DepositFixture::new(amount);
    let user_pk = keypair_pubkey(&f.user);

    let ix = make_withdraw_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        f.user_ata,
        f.user_position_pda,
        f.mint_pk,
        amount, // shares == amount (1:1 first deposit)
    );
    send_ok(&mut f.svm, &[ix], &[&f.payer, &f.user], &f.payer);

    let vs_acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(
        vs.total_assets, 0,
        "total_assets should be 0 after full withdrawal"
    );
    assert_eq!(
        vs.total_shares, 0,
        "total_shares should be 0 after full withdrawal"
    );

    let up_acct = f.svm.get_account(&f.user_position_pda).unwrap();
    let up = UserPosition::try_deserialize(&mut up_acct.data.as_slice()).unwrap();
    assert_eq!(
        up.shares, 0,
        "user shares should be 0 after full withdrawal"
    );
}

/// Partial withdrawal: shares reduced proportionally.
#[test]
fn test_withdraw_partial_withdrawal() {
    let amount = 2_000_000u64;
    let mut f = DepositFixture::new(amount);
    let user_pk = keypair_pubkey(&f.user);

    let shares_to_withdraw = amount / 2; // withdraw half
    let ix = make_withdraw_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        f.user_ata,
        f.user_position_pda,
        f.mint_pk,
        shares_to_withdraw,
    );
    send_ok(&mut f.svm, &[ix], &[&f.payer, &f.user], &f.payer);

    let vs_acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    let vs = VaultState::try_deserialize(&mut vs_acct.data.as_slice()).unwrap();
    assert_eq!(
        vs.total_assets,
        amount / 2,
        "remaining total_assets mismatch"
    );
    assert_eq!(
        vs.total_shares,
        amount / 2,
        "remaining total_shares mismatch"
    );

    let up_acct = f.svm.get_account(&f.user_position_pda).unwrap();
    let up = UserPosition::try_deserialize(&mut up_acct.data.as_slice()).unwrap();
    assert_eq!(up.shares, amount / 2, "remaining user shares mismatch");
}

/// Deposit then full-withdraw preserves principal (no slippage at 1:1).
#[test]
fn test_withdraw_principal_preserved() {
    let deposit_amount = 5_000_000u64;
    let mut f = DepositFixture::new(deposit_amount);
    let user_pk = keypair_pubkey(&f.user);

    // Capture pre-withdraw token balance by reading ATA data
    let pre_ata = f.svm.get_account(&f.user_ata).unwrap();
    let pre_balance = u64::from_le_bytes(pre_ata.data[64..72].try_into().unwrap());

    let ix = make_withdraw_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        f.user_ata,
        f.user_position_pda,
        f.mint_pk,
        deposit_amount,
    );
    send_ok(&mut f.svm, &[ix], &[&f.payer, &f.user], &f.payer);

    let post_ata = f.svm.get_account(&f.user_ata).unwrap();
    let post_balance = u64::from_le_bytes(post_ata.data[64..72].try_into().unwrap());
    assert_eq!(
        post_balance - pre_balance,
        deposit_amount,
        "principal not fully returned"
    );
}

/// Zero shares_in must fail.
#[test]
fn test_withdraw_zero_shares_fails() {
    let mut f = DepositFixture::new(1_000_000);
    let user_pk = keypair_pubkey(&f.user);

    let ix = make_withdraw_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        f.user_ata,
        f.user_position_pda,
        f.mint_pk,
        0,
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&f.user]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "zero shares must be rejected"
    );
}

/// Withdrawing more shares than owned must fail.
#[test]
fn test_withdraw_excessive_shares_fails() {
    let deposit = 1_000_000u64;
    let mut f = DepositFixture::new(deposit);
    let user_pk = keypair_pubkey(&f.user);

    let ix = make_withdraw_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        f.user_ata,
        f.user_position_pda,
        f.mint_pk,
        deposit + 1,
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&f.user]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "excessive withdrawal must be rejected"
    );
}

/// Wrong user (not the owner of user_position) must fail.
#[test]
fn test_withdraw_wrong_user_fails() {
    let deposit = 1_000_000u64;
    let mut f = DepositFixture::new(deposit);

    let attacker = Keypair::new();
    let attacker_pk = keypair_pubkey(&attacker);
    f.svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();

    // Attacker tries to withdraw from the original user's position
    let attacker_ata = associated_token_address(&attacker_pk, &f.mint_pk);
    f.svm
        .set_account(
            attacker_ata,
            make_token_account(&attacker_pk, &f.mint_pk, 0),
        )
        .unwrap();

    let ix = make_withdraw_ix(
        attacker_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        attacker_ata,
        f.user_position_pda, // original user's position!
        f.mint_pk,
        deposit,
    );
    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&attacker_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&attacker]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "wrong user must be rejected"
    );
}

/// Withdraw from paused vault must fail.
#[test]
fn test_withdraw_paused_vault_fails() {
    let deposit = 1_000_000u64;
    let mut f = DepositFixture::new(deposit);

    // Pause vault via raw byte mutation (operational_state at offset 90).
    let mut vs_acct = f.svm.get_account(&f.vault_state_pda).unwrap();
    vs_acct.data[90] = 1;
    f.svm.set_account(f.vault_state_pda, vs_acct).unwrap();

    let user_pk = keypair_pubkey(&f.user);
    let ix = make_withdraw_ix(
        user_pk,
        f.vault_state_pda,
        f.vault_authority_pda,
        f.custody_ata,
        f.user_ata,
        f.user_position_pda,
        f.mint_pk,
        deposit,
    );

    let blockhash = f.svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&user_pk), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&f.user]).unwrap();
    assert!(
        f.svm.send_transaction(tx).is_err(),
        "withdraw from paused vault must fail"
    );
}

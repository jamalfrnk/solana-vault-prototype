/**
 * M21 read-only persistent-account inventory.
 *
 * Queries only program-owned accounts at the three known fixed lengths, checks
 * discriminators and canonical derivations locally, links UserPositionV1
 * accounts to vaults, reads custody balances in batches, and prints JSON to
 * stdout. It never signs, submits a transaction, or writes a file.
 *
 * Usage:
 *   corepack yarn inventory:legacy
 *   corepack yarn inventory:legacy --url https://api.devnet.solana.com
 *   corepack yarn inventory:legacy --fail-on-blockers
 */

import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";

import {
  LEGACY_VAULT_STATE_LEN,
  USER_POSITION_LEN,
  VAULT_STATE_LEN,
  decodeUserPosition,
  inspectVaultStateAccount,
} from "../sdk/src/accounts";
import { PROGRAM_ID, TOKEN_PROGRAM_ID } from "../sdk/src/constants";
import { accountDiscriminator } from "../sdk/src/discriminator";
import {
  deriveAssociatedTokenAddress,
  deriveUserPositionPda,
  deriveVaultAuthorityPda,
  deriveVaultStatePda,
} from "../sdk/src/pdas";

const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const COMMITMENT = "confirmed" as const;

interface ProgramAccount {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
}

function hasDiscriminator(data: Buffer, name: string): boolean {
  return data.subarray(0, 8).equals(accountDiscriminator(name));
}

async function getProgramAccountsBySize(
  connection: Connection,
  size: number
): Promise<ProgramAccount[]> {
  return [
    ...(await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: COMMITMENT,
      filters: [{ dataSize: size }],
    })),
  ];
}

async function getMultipleAccounts(
  connection: Connection,
  addresses: PublicKey[]
): Promise<(AccountInfo<Buffer> | null)[]> {
  const result: (AccountInfo<Buffer> | null)[] = [];
  for (let start = 0; start < addresses.length; start += 100) {
    result.push(
      ...(await connection.getMultipleAccountsInfo(
        addresses.slice(start, start + 100),
        {
          commitment: COMMITMENT,
        }
      ))
    );
  }
  return result;
}

function publicRpcLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "custom-rpc";
  }
}

function parseCli(argv: string[]): {
  endpoint: string;
  failOnBlockers: boolean;
} {
  let endpoint = process.env.SOLANA_RPC_URL ?? DEFAULT_DEVNET_RPC;
  let failOnBlockers = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") {
      if (!argv[i + 1]) throw new Error("--url requires an RPC endpoint");
      endpoint = argv[++i];
    } else if (argv[i] === "--fail-on-blockers") {
      failOnBlockers = true;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return { endpoint, failOnBlockers };
}

function custodyFacts(
  account: AccountInfo<Buffer> | null,
  expectedMint: PublicKey,
  expectedAuthority: PublicKey
) {
  if (!account) {
    return {
      exists: false,
      tokenProgramOwner: false,
      dataLength: null,
      initialized: false,
      mintMatches: false,
      authorityMatches: false,
      amount: null,
    };
  }
  const data = account.data;
  const hasTokenFields = data.length >= 72;
  return {
    exists: true,
    tokenProgramOwner: account.owner.equals(TOKEN_PROGRAM_ID),
    dataLength: data.length,
    initialized: data.length === 165 && data.readUInt8(108) === 1,
    mintMatches:
      hasTokenFields &&
      new PublicKey(data.subarray(0, 32)).equals(expectedMint),
    authorityMatches:
      hasTokenFields &&
      new PublicKey(data.subarray(32, 64)).equals(expectedAuthority),
    amount: hasTokenFields
      ? new DataView(data.buffer, data.byteOffset, data.byteLength)
          .getBigUint64(64, true)
          .toString()
      : null,
  };
}

export async function buildInventory(connection: Connection, rpcLabel: string) {
  const [legacyCandidates, currentCandidates, positionCandidates] =
    await Promise.all([
      getProgramAccountsBySize(connection, LEGACY_VAULT_STATE_LEN),
      getProgramAccountsBySize(connection, VAULT_STATE_LEN),
      getProgramAccountsBySize(connection, USER_POSITION_LEN),
    ]);

  const vaultAccounts = [...legacyCandidates, ...currentCandidates].filter(
    ({ account }) => hasDiscriminator(account.data, "VaultState")
  );
  const positions = positionCandidates
    .filter(({ account }) => hasDiscriminator(account.data, "UserPosition"))
    .map(({ pubkey, account }) => {
      const decoded = decodeUserPosition(account.data);
      const expected = deriveUserPositionPda(decoded.vault, decoded.owner);
      return {
        address: pubkey.toBase58(),
        owner: decoded.owner.toBase58(),
        vault: decoded.vault.toBase58(),
        shares: decoded.shares.toString(),
        storedBump: decoded.bump,
        expectedBump: expected.bump,
        canonicalPda:
          expected.address.equals(pubkey) && expected.bump === decoded.bump,
      };
    });

  const inspectedVaults = vaultAccounts.map(({ pubkey, account }) => ({
    pubkey,
    account,
    inspection: inspectVaultStateAccount(account.data),
  }));
  const custodyAddresses = inspectedVaults.map(({ pubkey, inspection }) => {
    const authority = deriveVaultAuthorityPda(pubkey);
    return deriveAssociatedTokenAddress(authority.address, inspection.mint);
  });
  const custodyAccounts = await getMultipleAccounts(
    connection,
    custodyAddresses
  );

  const vaults = inspectedVaults.map(
    ({ pubkey, account, inspection }, index) => {
      const expectedVault = deriveVaultStatePda(inspection.mint);
      const expectedAuthority = deriveVaultAuthorityPda(pubkey);
      const linkedPositions = positions.filter(
        (position) => position.vault === pubkey.toBase58()
      );
      const positionShares = linkedPositions.reduce(
        (total, position) => total + BigInt(position.shares),
        0n
      );
      const custody = custodyFacts(
        custodyAccounts[index],
        inspection.mint,
        expectedAuthority.address
      );
      const blockers: string[] = [];
      if (inspection.layout === "legacy-113")
        blockers.push("legacy-113-retirement-required");
      if (inspection.layout === "v0-145")
        blockers.push("v0-migration-required");
      if (inspection.layout === "unsupported-145")
        blockers.push("unsupported-version");
      const maxOperationalState = inspection.layout === "v1-145" ? 2 : 1;
      if (inspection.operationalStateValue > maxOperationalState) {
        blockers.push("invalid-operational-state");
      }
      if (!inspection.reservedIsZero) blockers.push("nonzero-reserved-bytes");
      if (!expectedVault.address.equals(pubkey))
        blockers.push("noncanonical-vault-pda");
      if (expectedVault.bump !== inspection.vaultBump)
        blockers.push("wrong-vault-bump");
      if (expectedAuthority.bump !== inspection.authorityBump)
        blockers.push("wrong-authority-bump");
      if (positionShares !== inspection.totalShares)
        blockers.push("position-share-mismatch");
      if (linkedPositions.some((position) => !position.canonicalPda)) {
        blockers.push("noncanonical-user-position");
      }
      if (!custody.exists) blockers.push("custody-missing");
      if (custody.exists && !custody.tokenProgramOwner)
        blockers.push("custody-wrong-program");
      if (custody.exists && custody.dataLength !== 165)
        blockers.push("custody-wrong-size");
      if (custody.exists && !custody.initialized)
        blockers.push("custody-not-initialized");
      if (custody.exists && !custody.mintMatches)
        blockers.push("custody-wrong-mint");
      if (custody.exists && !custody.authorityMatches)
        blockers.push("custody-wrong-authority");
      if (
        custody.amount !== null &&
        BigInt(custody.amount) < inspection.totalAssets
      ) {
        blockers.push("custody-accounting-shortfall");
      }

      return {
        address: pubkey.toBase58(),
        accountLength: account.data.length,
        layout: inspection.layout,
        version: inspection.version,
        operationalStateValue: inspection.operationalStateValue,
        pauseAuthority: inspection.pauseAuthority.toBase58(),
        pendingPauseAuthority:
          inspection.pendingPauseAuthority?.toBase58() ?? null,
        mint: inspection.mint.toBase58(),
        totalAssets: inspection.totalAssets.toString(),
        totalShares: inspection.totalShares.toString(),
        reservedIsZero: inspection.reservedIsZero,
        canonical: {
          vaultPda: expectedVault.address.equals(pubkey),
          storedVaultBump: inspection.vaultBump,
          expectedVaultBump: expectedVault.bump,
          storedAuthorityBump: inspection.authorityBump,
          expectedAuthorityBump: expectedAuthority.bump,
        },
        custody: {
          address: custodyAddresses[index].toBase58(),
          ...custody,
        },
        positions: {
          count: linkedPositions.length,
          summedShares: positionShares.toString(),
          entries: linkedPositions,
        },
        blockers,
      };
    }
  );

  const knownVaultAddresses = new Set(vaults.map((vault) => vault.address));
  const orphanPositions = positions.filter(
    (position) => !knownVaultAddresses.has(position.vault)
  );
  const blockerCount =
    vaults.reduce((count, vault) => count + vault.blockers.length, 0) +
    orphanPositions.length;

  return {
    generatedAt: new Date().toISOString(),
    rpc: rpcLabel,
    commitment: COMMITMENT,
    programId: PROGRAM_ID.toBase58(),
    summary: {
      vaults: vaults.length,
      legacy113: vaults.filter((vault) => vault.layout === "legacy-113").length,
      version0: vaults.filter((vault) => vault.layout === "v0-145").length,
      version1: vaults.filter((vault) => vault.layout === "v1-145").length,
      unsupported145: vaults.filter(
        (vault) => vault.layout === "unsupported-145"
      ).length,
      userPositions: positions.length,
      orphanPositions: orphanPositions.length,
      blockerCount,
    },
    vaults,
    orphanPositions,
  };
}

async function main(): Promise<void> {
  const { endpoint, failOnBlockers } = parseCli(process.argv.slice(2));
  const connection = new Connection(endpoint, COMMITMENT);
  const inventory = await buildInventory(connection, publicRpcLabel(endpoint));
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
  if (failOnBlockers && inventory.summary.blockerCount > 0)
    process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const kind = error instanceof Error ? error.name : "UnknownError";
    console.error(
      `Legacy account inventory failed (${kind}). Verify RPC reachability and arguments; no transaction was sent.`
    );
    process.exitCode = 1;
  });
}

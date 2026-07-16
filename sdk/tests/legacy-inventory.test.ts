import { expect } from "chai";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";

import { buildInventory } from "../../scripts/inventory_legacy_accounts";
import {
  LEGACY_VAULT_STATE_LEN,
  USER_POSITION_LEN,
  VAULT_STATE_LEN,
} from "../src/accounts";
import {
  LEGACY_DEVNET_PROGRAM_ID,
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../src/constants";
import { accountDiscriminator } from "../src/discriminator";
import {
  deriveAssociatedTokenAddress,
  deriveUserPositionPda,
  deriveVaultAuthorityPda,
  deriveVaultStatePda,
} from "../src/pdas";

function key(fill: number): PublicKey {
  return new PublicKey(Buffer.alloc(32, fill));
}

function account(data: Buffer, owner = PROGRAM_ID): AccountInfo<Buffer> {
  return { data, executable: false, lamports: 1, owner, rentEpoch: 0 };
}

function vaultFixture(params: {
  mint: PublicKey;
  length: typeof LEGACY_VAULT_STATE_LEN | typeof VAULT_STATE_LEN;
  totalAssets?: bigint;
  totalShares?: bigint;
  operationalState?: number;
  version?: number;
  nonzeroReserved?: boolean;
  programId?: PublicKey;
}) {
  const programId = params.programId ?? PROGRAM_ID;
  const vault = deriveVaultStatePda(params.mint, programId);
  const authority = deriveVaultAuthorityPda(vault.address, programId);
  const data = Buffer.alloc(params.length);
  accountDiscriminator("VaultState").copy(data);
  key(90).toBuffer().copy(data, 8);
  params.mint.toBuffer().copy(data, 40);
  data[72] = vault.bump;
  data[73] = authority.bump;
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    74,
    params.totalAssets ?? 0n,
    true
  );
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    82,
    params.totalShares ?? 0n,
    true
  );
  data[90] = params.operationalState ?? 0;
  if (params.length === VAULT_STATE_LEN) {
    data[123] = params.version ?? 1;
    if (params.nonzeroReserved) data[124] = 1;
  } else if (params.nonzeroReserved) {
    data[91] = 1;
  }
  const custody = deriveAssociatedTokenAddress(authority.address, params.mint);
  return { vault, authority, custody, data };
}

function positionFixture(
  vault: PublicKey,
  owner: PublicKey,
  shares: bigint,
  programId: PublicKey = PROGRAM_ID
) {
  const position = deriveUserPositionPda(vault, owner, programId);
  const data = Buffer.alloc(USER_POSITION_LEN);
  accountDiscriminator("UserPosition").copy(data);
  owner.toBuffer().copy(data, 8);
  vault.toBuffer().copy(data, 40);
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    72,
    shares,
    true
  );
  data[80] = position.bump;
  return { position, data };
}

function custodyFixture(
  mint: PublicKey,
  authority: PublicKey,
  amount: bigint
): AccountInfo<Buffer> {
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0);
  authority.toBuffer().copy(data, 32);
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    64,
    amount,
    true
  );
  data[108] = 1;
  return account(data, TOKEN_PROGRAM_ID);
}

function mockConnection(
  bySize: Map<number, { pubkey: PublicKey; account: AccountInfo<Buffer> }[]>,
  custodyByAddress: Map<string, AccountInfo<Buffer>>
): Connection {
  return {
    getProgramAccounts: async (_programId: PublicKey, config: any) => {
      const dataSize = config.filters[0].dataSize as number;
      return bySize.get(dataSize) ?? [];
    },
    getMultipleAccountsInfo: async (addresses: PublicKey[]) =>
      addresses.map(
        (address) => custodyByAddress.get(address.toBase58()) ?? null
      ),
  } as unknown as Connection;
}

describe("legacy account inventory", () => {
  it("targets and derives against an explicit legacy program ID", async () => {
    const legacy = vaultFixture({
      mint: key(11),
      length: LEGACY_VAULT_STATE_LEN,
      programId: LEGACY_DEVNET_PROGRAM_ID,
    });
    const requestedProgramIds: string[] = [];
    const connection = {
      getProgramAccounts: async (programId: PublicKey, config: any) => {
        requestedProgramIds.push(programId.toBase58());
        const dataSize = config.filters[0].dataSize as number;
        if (dataSize === LEGACY_VAULT_STATE_LEN) {
          return [
            {
              pubkey: legacy.vault.address,
              account: account(legacy.data, LEGACY_DEVNET_PROGRAM_ID),
            },
          ];
        }
        return [];
      },
      getMultipleAccountsInfo: async () => [
        custodyFixture(key(11), legacy.authority.address, 0n),
      ],
    } as unknown as Connection;

    const inventory = await buildInventory(
      connection,
      "mock://rpc",
      LEGACY_DEVNET_PROGRAM_ID
    );

    expect(inventory.programId).to.equal(LEGACY_DEVNET_PROGRAM_ID.toBase58());
    expect(requestedProgramIds).to.deep.equal([
      LEGACY_DEVNET_PROGRAM_ID.toBase58(),
      LEGACY_DEVNET_PROGRAM_ID.toBase58(),
      LEGACY_DEVNET_PROGRAM_ID.toBase58(),
    ]);
    expect(inventory.vaults[0].canonical.vaultPda).to.equal(true);
    expect(inventory.vaults[0].blockers).to.deep.equal([
      "legacy-113-retirement-required",
    ]);
  });

  it("classifies 113-byte, v0, and healthy v1 vaults and reconciles positions/custody", async () => {
    const legacy = vaultFixture({
      mint: key(1),
      length: LEGACY_VAULT_STATE_LEN,
      totalAssets: 10n,
      totalShares: 10n,
    });
    const v0 = vaultFixture({
      mint: key(2),
      length: VAULT_STATE_LEN,
      version: 0,
    });
    const v1 = vaultFixture({
      mint: key(3),
      length: VAULT_STATE_LEN,
      totalAssets: 20n,
      totalShares: 20n,
    });
    const legacyPosition = positionFixture(legacy.vault.address, key(4), 10n);
    const v1Position = positionFixture(v1.vault.address, key(5), 20n);
    const connection = mockConnection(
      new Map([
        [
          LEGACY_VAULT_STATE_LEN,
          [{ pubkey: legacy.vault.address, account: account(legacy.data) }],
        ],
        [
          VAULT_STATE_LEN,
          [
            { pubkey: v0.vault.address, account: account(v0.data) },
            { pubkey: v1.vault.address, account: account(v1.data) },
          ],
        ],
        [
          USER_POSITION_LEN,
          [
            {
              pubkey: legacyPosition.position.address,
              account: account(legacyPosition.data),
            },
            {
              pubkey: v1Position.position.address,
              account: account(v1Position.data),
            },
          ],
        ],
      ]),
      new Map([
        [
          legacy.custody.toBase58(),
          custodyFixture(key(1), legacy.authority.address, 10n),
        ],
        [
          v0.custody.toBase58(),
          custodyFixture(key(2), v0.authority.address, 0n),
        ],
        [
          v1.custody.toBase58(),
          custodyFixture(key(3), v1.authority.address, 20n),
        ],
      ])
    );

    const inventory = await buildInventory(connection, "mock://rpc");
    expect(inventory.summary).to.include({
      vaults: 3,
      legacy113: 1,
      version0: 1,
      version1: 1,
      userPositions: 2,
      orphanPositions: 0,
      blockerCount: 2,
    });
    expect(
      inventory.vaults.find((vault) => vault.layout === "legacy-113")!.blockers
    ).to.deep.equal(["legacy-113-retirement-required"]);
    expect(
      inventory.vaults.find((vault) => vault.layout === "v0-145")!.blockers
    ).to.deep.equal(["v0-migration-required"]);
    expect(
      inventory.vaults.find((vault) => vault.layout === "v1-145")!.blockers
    ).to.deep.equal([]);
  });

  it("reports unsupported version, state, and reserved bytes as independent blockers", async () => {
    const malformed = vaultFixture({
      mint: key(6),
      length: VAULT_STATE_LEN,
      operationalState: 7,
      version: 9,
      nonzeroReserved: true,
    });
    const connection = mockConnection(
      new Map([
        [LEGACY_VAULT_STATE_LEN, []],
        [
          VAULT_STATE_LEN,
          [
            {
              pubkey: malformed.vault.address,
              account: account(malformed.data),
            },
          ],
        ],
        [USER_POSITION_LEN, []],
      ]),
      new Map([
        [
          malformed.custody.toBase58(),
          custodyFixture(key(6), malformed.authority.address, 0n),
        ],
      ])
    );

    const inventory = await buildInventory(connection, "mock://rpc");
    expect(inventory.vaults[0].blockers).to.include.members([
      "unsupported-version",
      "invalid-operational-state",
      "nonzero-reserved-bytes",
    ]);
  });
});

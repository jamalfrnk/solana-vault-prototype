import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Token-amount parsing/formatting (M17 Phase 2).
 *
 * The M14 forms passed the raw input to BigInt() as base units — typing
 * "1000" deposited 0.001 tokens on a 6-decimal mint, and any decimal point
 * threw. All user-facing amounts are now denominated in tokens (or shares,
 * which carry the same decimals as the underlying mint) and scaled here.
 */

/** Reads the mint's decimals byte (offset 44 of the 82-byte SPL mint layout). */
export async function fetchMintDecimals(
  connection: Connection,
  mint: PublicKey,
): Promise<number | null> {
  try {
    const info = await connection.getAccountInfo(mint);
    if (!info || info.data.length < 45) return null;
    return info.data[44];
  } catch {
    return null;
  }
}

export interface ParsedAmount {
  baseUnits: bigint;
  problem: string | null;
}

/** Parses a token-denominated decimal string into base units. */
export function parseTokenAmount(
  input: string,
  decimals: number,
): ParsedAmount {
  const trimmed = input.trim();
  if (trimmed === "") return { baseUnits: 0n, problem: "Enter an amount." };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return {
      baseUnits: 0n,
      problem: "Enter a positive number, digits and one decimal point only.",
    };
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    return {
      baseUnits: 0n,
      problem: `Too many decimal places — this token supports ${decimals}.`,
    };
  }
  const baseUnits = BigInt(whole + frac.padEnd(decimals, "0"));
  if (baseUnits === 0n)
    return { baseUnits: 0n, problem: "Amount must be greater than zero." };
  return { baseUnits, problem: null };
}

/** Formats base units as a token-denominated string, trimming trailing zeros. */
export function formatTokenAmount(baseUnits: bigint, decimals: number): string {
  const negative = baseUnits < 0n;
  const abs = negative ? -baseUnits : baseUnits;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${body}` : body;
}

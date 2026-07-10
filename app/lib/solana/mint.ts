import { PublicKey } from "@solana/web3.js";

/** Parses a user-entered mint address; returns null rather than throwing on invalid input. */
export function parseMintAddress(input: string): PublicKey | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  try {
    return new PublicKey(trimmed);
  } catch {
    return null;
  }
}

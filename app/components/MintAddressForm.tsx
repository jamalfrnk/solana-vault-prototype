"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { parseMintAddress } from "../lib/solana/mint";

export function MintAddressForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const mint = parseMintAddress(value);
    if (!mint) {
      setError("Invalid mint address. Enter a valid Solana public key.");
      return;
    }
    setError(null);
    router.push(`/vault/${mint.toBase58()}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="mint-address">Mint address</label>
      <input
        id="mint-address"
        name="mint-address"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter the vault's mint address"
      />
      <button type="submit">View vault</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

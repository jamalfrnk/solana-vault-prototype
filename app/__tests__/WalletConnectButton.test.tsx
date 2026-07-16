import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletProvider, ConnectionProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Connection } from "@solana/web3.js";

import { WalletConnectButton } from "../components/WalletConnectButton";

function renderWithWalletContext(ui: React.ReactElement) {
  const connection = new Connection("http://localhost:8899");
  return render(
    <ConnectionProvider endpoint={connection.rpcEndpoint}>
      <WalletProvider wallets={[]} autoConnect={false}>
        <WalletModalProvider>{ui}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>,
  );
}

describe("WalletConnectButton", () => {
  it("renders a wallet connect affordance when no wallet is connected", () => {
    renderWithWalletContext(<WalletConnectButton />);
    expect(screen.getByRole("button", { name: "Connect Wallet" })).to.exist;
  });
});

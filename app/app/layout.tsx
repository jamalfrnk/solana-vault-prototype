import type { ReactNode } from "react";
import { Orbitron, Exo_2 } from "next/font/google";
import "./globals.css";
import "./vault.css";
import { Providers } from "./providers";
import { ClusterWarningBanner } from "../components/ClusterWarningBanner";
import { CryptoNetworkBackground } from "../components/CryptoNetworkBackground";

const displayFont = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});

const bodyFont = Exo_2({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-body",
});

export const metadata = {
  title: "Solana Vault",
  description: "Interview-grade single-asset SPL-token vault — dApp shell (M14)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <CryptoNetworkBackground />
        <Providers>
          <ClusterWarningBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}

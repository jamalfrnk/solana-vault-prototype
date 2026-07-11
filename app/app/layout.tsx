import type { ReactNode } from "react";
import "./globals.css";
import "./vault.css";
import { Providers } from "./providers";
import { ClusterWarningBanner } from "../components/ClusterWarningBanner";

export const metadata = {
  title: "Solana Vault",
  description: "Interview-grade single-asset SPL-token vault — dApp shell (M14)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ClusterWarningBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}

import type { NextConfig } from "next";
import path from "path";

// Root is the repo root, not app/ itself — app/ legitimately imports sdk/src via a
// relative path alias (see tsconfig.json's @vault-sdk paths entry), so Turbopack's
// workspace root must encompass both directories, not just app/.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;

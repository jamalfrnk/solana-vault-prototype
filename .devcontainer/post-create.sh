#!/usr/bin/env bash
# Idempotent post-create script for solana-vault-prototype Codespace.
# Installs Agave CLI, avm, and Anchor CLI at pinned versions.
# Does NOT generate keypairs or wallets.
set -euo pipefail

AGAVE_VERSION="v3.1.10"
ANCHOR_VERSION="1.0.2"
SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin"
AVM_BIN="$HOME/.avm/bin"

export PATH="$SOLANA_BIN:$AVM_BIN:$PATH"

echo "=== Installing Agave CLI ${AGAVE_VERSION} ==="
if command -v solana &>/dev/null && solana --version | grep -q "${AGAVE_VERSION#v}"; then
  echo "  Agave CLI ${AGAVE_VERSION} already installed, skipping."
else
  sh -c "$(curl -sSfL "https://release.anza.xyz/${AGAVE_VERSION}/install")"
fi

echo "=== Installing avm (Anchor Version Manager) ==="
if command -v avm &>/dev/null; then
  echo "  avm already installed, skipping."
else
  # Pinned to the v${ANCHOR_VERSION} tag, not the default branch: an unpinned
  # `--git` install floats to whatever is on `main`, which later required a
  # newer rustc than this project's pinned toolchain and broke fresh installs.
  cargo install --git https://github.com/coral-xyz/anchor --tag "v${ANCHOR_VERSION}" avm --locked --force
fi

echo "=== Installing Anchor CLI ${ANCHOR_VERSION} via avm ==="
avm install "${ANCHOR_VERSION}"
avm use "${ANCHOR_VERSION}"

echo ""
echo "=== Installed versions ==="
rustc   --version
cargo   --version
solana  --version
anchor  --version
node    --version
npm     --version
git     --version
gh      --version
echo "==========================="
echo "Setup complete. No keypairs or wallets were created."

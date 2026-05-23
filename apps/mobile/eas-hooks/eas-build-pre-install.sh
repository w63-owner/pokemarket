#!/usr/bin/env bash
# EAS Build hook — runs before dependency installation.
#
# In a monorepo, EAS may run npm install from apps/mobile rather than
# the workspace root. This hook navigates to the workspace root and runs
# npm install there first so that:
#  - @pokemarket/shared is resolved as a local workspace package
#  - Root devDependencies (turbo, etc.) are available during the build
#
set -euo pipefail

# Resolve workspace root (two levels up from apps/mobile)
WORKSPACE_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
echo "[pre-install] Workspace root: $WORKSPACE_ROOT"

# Install from workspace root so all workspace packages are linked
cd "$WORKSPACE_ROOT"
echo "[pre-install] Running npm install from workspace root..."
npm install --legacy-peer-deps --ignore-scripts 2>&1
echo "[pre-install] Done."

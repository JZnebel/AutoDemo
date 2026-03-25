#!/bin/bash
#
# Setup Chrome DevTools MCP fork for AutoDemo
#
# Initializes the git submodule, installs dependencies, and builds.
# Run this after cloning AutoDemo for the first time.
#
# Usage:
#   bash scripts/setup-devtools-mcp.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
TARGET="$ROOT/chrome-devtools-mcp"

echo "══════════════════════════════════════════"
echo "AutoDemo: Chrome DevTools MCP Setup"
echo "══════════════════════════════════════════"
echo ""

# Step 1: Initialize submodule
if [ ! -f "$TARGET/package.json" ]; then
  echo "→ Initializing submodule..."
  cd "$ROOT"
  git submodule update --init --recursive chrome-devtools-mcp
else
  echo "→ Submodule already initialized"
fi

cd "$TARGET"

# Step 2: Install dependencies
echo "→ Installing dependencies..."
npm install 2>&1 | tail -3

# Step 3: Build
echo "→ Building..."
npm run build 2>&1 | tail -3
echo "  Build complete"

echo ""
echo "══════════════════════════════════════════"
echo "Done! Chrome DevTools MCP fork is ready."
echo ""
echo "  Build: $TARGET/build/src/bin/chrome-devtools-mcp.js"
echo "  .mcp.json already points at: ./chrome-devtools-mcp/build/..."
echo ""
echo "Restart Claude Code to pick up the MCP server."
echo "══════════════════════════════════════════"

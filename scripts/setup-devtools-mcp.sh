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
echo "AutoDemo: Setup (MCP + Remotion Skills)"
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

# Step 4: Install Remotion agent skills
echo "→ Installing Remotion agent skills..."
cd "$ROOT/demo-render"
npx --yes skills add remotion-dev/skills --yes 2>&1 | tail -3
# Ensure root symlink exists so skills are available project-wide
if [ ! -L "$ROOT/.claude/skills/remotion-best-practices" ]; then
  ln -s ../demo-render/.agents/skills/remotion-best-practices "$ROOT/.claude/skills/remotion-best-practices"
  echo "  Symlinked to .claude/skills/"
fi

echo ""
echo "══════════════════════════════════════════"
echo "Done! AutoDemo is ready."
echo ""
echo "  MCP: $TARGET/build/src/bin/chrome-devtools-mcp.js"
echo "  Remotion skills: .claude/skills/remotion-best-practices"
echo ""
echo "Restart Claude Code to pick up the MCP server and skills."
echo "══════════════════════════════════════════"

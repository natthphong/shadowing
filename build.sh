#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Daily Speaking — Build ==="
echo ""

# --- npm install ---
echo "[1/4] Installing npm dependencies..."
npm install --ignore-scripts
echo "  ✅ npm install"

# --- Rebuild native modules ---
echo "[2/4] Rebuilding native modules for Electron..."
./node_modules/.bin/electron-rebuild -f -w better-sqlite3
echo "  ✅ better-sqlite3 rebuilt"

# --- Compile TypeScript ---
echo "[3/4] Compiling TypeScript (electron-vite build)..."
npm run build
echo "  ✅ TypeScript compiled"

# --- Package as .dmg ---
echo "[4/4] Packaging as .dmg..."
./node_modules/.bin/electron-builder --mac dmg
echo "  ✅ DMG created"

echo ""
echo "=== Build complete! ==="
DMG=$(ls release/*.dmg 2>/dev/null | head -1)
if [ -n "$DMG" ]; then
  SIZE=$(du -sh "$DMG" | cut -f1)
  echo "  Output: $DMG ($SIZE)"
  echo ""
  echo "Install: open '$DMG' then drag Daily Speaking → Applications"
fi

#!/bin/bash
set -e

BREW="/opt/homebrew/bin/brew"
PYTHON3="/opt/homebrew/bin/python3"
PIP3="/opt/homebrew/bin/pip3"

echo "=== Daily Speaking — Pre-install Setup ==="
echo ""

# --- Homebrew ---
if ! command -v brew &>/dev/null; then
  echo "[1/6] Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  echo "[1/6] Homebrew already installed ✅"
fi

# --- System tools ---
echo "[2/6] Installing ffmpeg, yt-dlp, python3..."
$BREW install ffmpeg yt-dlp python3 2>/dev/null || true
echo "  ffmpeg: $($BREW list --versions ffmpeg 2>/dev/null | head -1)"
echo "  yt-dlp: $($BREW list --versions yt-dlp 2>/dev/null | head -1)"
echo "  python3: $($PYTHON3 --version)"

# --- Python packages ---
echo "[3/6] Installing Python packages (mlx-whisper, snac, torch)..."
$PIP3 install -q mlx-whisper 2>/dev/null || $PIP3 install mlx-whisper
$PIP3 install -q snac torch numpy requests 2>/dev/null || $PIP3 install snac torch numpy requests
echo "  mlx-whisper: $($PYTHON3 -c 'import mlx_whisper; print("ok")' 2>/dev/null || echo 'not installed')"
echo "  snac: $($PYTHON3 -c 'import snac; print("ok")' 2>/dev/null || echo 'not installed (Orpheus TTS will use macOS say fallback)')"

# --- Ollama ---
echo "[4/6] Checking Ollama..."
if ! command -v ollama &>/dev/null && ! test -f /Applications/Ollama.app/Contents/MacOS/Ollama; then
  echo "  Ollama not found. Please install from https://ollama.com then re-run this script."
  echo "  After install: ollama serve &"
else
  echo "  Ollama found ✅"
fi

# --- Ollama models ---
echo "[5/6] Pulling required Ollama models (this may take a while)..."
OLLAMA_CMD=""
if command -v ollama &>/dev/null; then
  OLLAMA_CMD="ollama"
elif test -f /usr/local/bin/ollama; then
  OLLAMA_CMD="/usr/local/bin/ollama"
fi

if [ -n "$OLLAMA_CMD" ]; then
  # Start ollama if not running
  curl -s http://localhost:11434/api/tags &>/dev/null || (ollama serve &>/dev/null & sleep 3)

  MODELS=(
    "qwen3.5:9b"
    "scb10x/typhoon-translate1.5-4b"
    "legraphista/Orpheus:latest"
  )
  for model in "${MODELS[@]}"; do
    echo "  Pulling $model..."
    $OLLAMA_CMD pull "$model" 2>/dev/null && echo "  ✅ $model" || echo "  ⚠️  $model (pull failed, skip)"
  done
  echo "  Note: qwen3.6:27b (post-session analysis) is large (~16GB). Pull manually if needed:"
  echo "        ollama pull qwen3.6:27b"
else
  echo "  ⚠️  Ollama CLI not found — please pull models manually after installing Ollama"
fi

# --- Node.js ---
echo "[6/6] Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "  Node.js not found. Installing via Homebrew..."
  $BREW install node
else
  echo "  Node.js: $(node --version) ✅"
fi

echo ""
echo "=== Setup complete! Run ./build.sh to build the app ==="

#!/usr/bin/env python3
"""
TTS generation using legraphista/Orpheus via Ollama.
Falls back to macOS say command if Orpheus is unavailable.
Usage: tts_generate.py <text> <output_wav_path> [voice]
Prints JSON result to stdout, progress to stderr.
"""
import sys
import json
import re
import io
import wave
import os
import subprocess
import urllib.request

OLLAMA_BASE = "http://localhost:11434"
ORPHEUS_MODEL = "legraphista/Orpheus:latest"
SAMPLE_RATE = 24000
FFMPEG = "/opt/homebrew/bin/ffmpeg"


def call_ollama_orpheus(text: str, voice: str = "tara") -> str:
    prompt = f"<|audio|>voice: {voice}\n{text}<|/audio|>"
    body = json.dumps({
        "model": ORPHEUS_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 4096}
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode())
    return data.get("response", "")


def decode_snac(tokens: list) -> bytes:
    import torch
    from snac import SNAC
    import numpy as np

    # Orpheus adds offset of 10 to each token index
    adjusted = [max(0, t - 10) for t in tokens]

    # 7 tokens per frame: [coarse, mid, mid, fine, fine, fine, fine]
    l0, l1, l2 = [], [], []
    i = 0
    while i + 6 < len(adjusted):
        l0.append(adjusted[i])
        l1.extend([adjusted[i + 1], adjusted[i + 2]])
        l2.extend([adjusted[i + 3], adjusted[i + 4], adjusted[i + 5], adjusted[i + 6]])
        i += 7

    if not l0:
        raise RuntimeError("No complete audio frames in token stream")

    model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz")
    model.eval()

    with torch.inference_mode():
        codes = [
            torch.tensor(l0, dtype=torch.long).unsqueeze(0),
            torch.tensor(l1, dtype=torch.long).unsqueeze(0),
            torch.tensor(l2, dtype=torch.long).unsqueeze(0),
        ]
        audio = model.decode(codes)

    samples_np = (audio.squeeze().numpy() * 32767).clip(-32768, 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(samples_np.tobytes())
    return buf.getvalue()


def tts_with_orpheus(text: str, voice: str, out_path: str) -> dict:
    print(f"Calling Orpheus ({voice})...", file=sys.stderr)
    response = call_ollama_orpheus(text, voice)
    tokens = [int(t) for t in re.findall(r"<custom_token_(\d+)>", response)]

    if not tokens:
        raise RuntimeError(f"No audio tokens. Response: {response[:100]}")

    print(f"Decoding {len(tokens)} SNAC tokens...", file=sys.stderr)
    wav_bytes = decode_snac(tokens)
    with open(out_path, "wb") as f:
        f.write(wav_bytes)
    return {"success": True, "path": out_path, "method": "orpheus", "tokens": len(tokens)}


def tts_with_say(text: str, out_path: str) -> dict:
    print("Using macOS say fallback...", file=sys.stderr)
    aiff_path = out_path.replace(".wav", ".aiff")
    subprocess.run(["say", "-o", aiff_path, "--", text], check=True, timeout=60)
    subprocess.run(
        [FFMPEG, "-i", aiff_path, "-ar", "24000", "-ac", "1", "-y", out_path],
        check=True, capture_output=True, timeout=30
    )
    if os.path.exists(aiff_path):
        os.remove(aiff_path)
    return {"success": True, "path": out_path, "method": "say"}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: tts_generate.py <text> <output_wav_path> [voice]"}))
        sys.exit(1)

    text = sys.argv[1]
    out_path = sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else "tara"

    print(f"TTS: '{text[:60]}' → {out_path}", file=sys.stderr)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    try:
        result = tts_with_orpheus(text, voice, out_path)
    except Exception as e1:
        print(f"Orpheus failed: {e1}", file=sys.stderr)
        try:
            result = tts_with_say(text, out_path)
        except Exception as e2:
            print(json.dumps({"error": f"Both TTS methods failed: {e1} | {e2}"}))
            sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()

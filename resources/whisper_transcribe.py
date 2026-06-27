#!/usr/bin/env python3
import sys
import json

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: whisper_transcribe.py <audio_path> [model]"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "mlx-community/whisper-large-v3-turbo"

    print(f"Loading model: {model}", file=sys.stderr)
    print(f"Transcribing: {audio_path}", file=sys.stderr)

    import mlx_whisper

    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo=model,
        word_timestamps=True,
        language="en",
        verbose=False
    )

    # Normalize to our expected format
    output = {
        "text": result.get("text", ""),
        "language": result.get("language", "en"),
        "segments": []
    }

    for i, seg in enumerate(result.get("segments", [])):
        words = []
        for w in seg.get("words", []):
            words.append({
                "word": w.get("word", ""),
                "start": w.get("start", 0),
                "end": w.get("end", 0)
            })

        output["segments"].append({
            "id": i,
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "text": seg.get("text", "").strip(),
            "words": words
        })

    print(json.dumps(output))

if __name__ == "__main__":
    main()

# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**Daily Speaking** — a macOS desktop app for English shadowing and speaking practice. Users import YouTube links, video/audio files, or pasted transcripts; the app transcribes, translates each sentence to Thai, and lets users practice sentence-by-sentence with voice recording and AI scoring.

## Planned Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Frontend | React (inside Electron renderer) |
| Backend services | Node.js process or Python local service |
| Database | SQLite (local only) |
| Audio extraction | FFmpeg |
| STT (transcription + recording eval) | Whisper large-v3-turbo |
| Interactive translation | scb10x/typhoon-translate1.5-4b |
| Bulk segment translation | Qwen or Gemma (JSON-only responses) |
| Post-session analysis | qwen3.6:27b via Ollama |

Models run locally via Ollama. The app must work offline after models are installed (YouTube import requires internet).

## Repository Layout

```
frontend/     # React renderer code (not yet scaffolded)
backend/      # Node.js or Python service code (not yet scaffolded)
REQUIREMENT.md   # Full product requirements
DESIGN.md        # Design system tokens (colors, typography, spacing)
ref-fronend.html # Reference UI implementation (Tailwind + Material Symbols)
ref-sceen.png    # Reference screenshot
```

## Architecture

### Electron Process Model
- **Main process** — manages windows, IPC, file system, SQLite, Ollama/Whisper calls
- **Renderer process** — React UI; communicates with main via `ipcRenderer`/`ipcMain`
- Heavy AI work (Whisper transcription, Ollama inference) must run in the main process or a spawned child process to avoid blocking the UI

### Import Pipeline
1. YouTube URL → fetch metadata → download audio (yt-dlp) → Whisper → segment → bulk translate → save session
2. Local video/audio → FFmpeg extract audio → Whisper → segment → bulk translate → save session
3. Pasted transcript → parse → segment → bulk translate → save session

### Core Feature Areas
- **Practice Mode** — sentence-by-sentence playback, user voice recording, Whisper transcription of recording, accuracy/rhythm/speed scoring
- **AI Feedback** — per-sentence (lightweight) and post-session (qwen3.6:27b JSON output)
- **Flashcard & SRS** — Anki-style spaced repetition for sentences, vocabulary, pronunciation, grammar cards
- **Grammar Library** — deduplicated grammar topics extracted per session
- **Dashboard** — progress metrics across all sessions

### Bulk Translation Contract
Send 20–30 segments per request. Model **must** return strict JSON only:
```json
[{"id": "seg_001", "original": "...", "translate": "..."}]
```
Validate JSON, retry on failure, never merge/reorder/drop segments.

### Key Data Entities (SQLite)
`Source` → `Session` → `Segment` ↔ `Translation`
`Segment` ← `PracticeAttempt` → `Feedback`
`Segment` → `VocabularyItem`, `GrammarItem`, `Flashcard` → `ReviewHistory`

### Scoring Schema (per attempt)
```json
{"accuracy_score": 0-100, "pronunciation_score": 0-100,
 "rhythm_score": 0-100, "speed_score": 0-100, "overall_score": 0-100}
```
Auto-flag sentences with `overall_score < threshold` for the SRS review queue.

## Design System

The UI follows the tokens in `DESIGN.md` and `ref-fronend.html`. Key rules:

- **Colors** — Material Design 3 palette. Primary blue `#0058be` for interactive elements only. Green `#006947` for AI model healthy status; amber for loading/processing.
- **Layout** — Fixed 260px sidebar / fluid content area. Two-pane workspace: video player (top/left) + scrollable transcript (right). 8px grid; 16px component gaps; 24px section margins.
- **Typography** — Inter everywhere. Thai text (`transcript-th` 24px) renders 25% larger than English (`transcript-en` 18px) for legibility. `JetBrains Mono` only for IPA labels and AI status pills.
- **Active sentence card** — `secondary-container` background + 4px `primary` left border.
- **AI status pill** (sidebar footer) — pulsing dot (green/amber/gray) + model name in `JetBrains Mono`.
- **Elevation** — tonal layers, no heavy shadows. Popovers use `0 4px 6px -1px rgb(0 0 0 / 0.05)`.

## Model Responsibilities

| Model | Used for |
|---|---|
| Whisper large-v3-turbo | Transcribing imports; transcribing user recordings during practice |
| scb10x/typhoon-translate1.5-4b | Interactive (on-demand) word/phrase/sentence translation |
| Qwen / Gemma | Bulk batch translation of 20–30 segments during import |
| qwen3.6:27b | Post-session analysis, grammar/vocab extraction, flashcard generation |

Design the model layer so each model can be swapped independently (model replaceability is a non-functional requirement).

## MVP Sequence

1. **MVP 1** — Import (YouTube + local file), Whisper transcription, Thai bulk translation, sentence-by-sentence playback, voice recording, basic scoring, session history
2. **MVP 2** — Per-sentence AI feedback, post-session qwen3.6:27b analysis, weak sentence detection, vocab extraction
3. **MVP 3** — Flashcards (4 types), Anki SRS, Thai→English speaking review, hint system
4. **MVP 4** — Dashboard, grammar library with deduplication, vocab library, progress tracking

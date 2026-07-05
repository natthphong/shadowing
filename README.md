# Daily Speaking

Daily Speaking is a local-first macOS desktop app for English shadowing and speaking practice. Import a YouTube link, local media file, or transcript; the app transcribes and translates it into sentence-level practice, records your voice, scores attempts, creates flashcards, and generates a post-session comprehension exam.

![Sessions and progress](docs/images/sessions.png)

![Shadowing practice](docs/images/practice.png)

## Features

- YouTube, video, audio, and pasted-transcript imports
- Local Whisper transcription and sentence segmentation
- Thai translation through configurable Ollama models
- Sentence playback, loop, auto-advance, speed control, AI voice, and recording
- Accuracy, pronunciation, rhythm, speed, and overall scores
- Persisted session progress shared by Practice, Sessions, and Dashboard
- Due-today SRS review plus a searchable **Show All** flashcard library
- Post-session AI analysis with vocabulary, grammar, and weak-sentence extraction
- AI-generated 5/7/10-question comprehension exams with tags, saved attempts, answer review, and unlimited retakes
- Local SQLite storage; no cloud account required

The current release version is shown in the bottom-right corner of the app.

## Requirements

- macOS on Apple Silicon (the packaged DMG targets `arm64`)
- Node.js 18 or newer
- Homebrew
- FFmpeg, yt-dlp, and Python 3
- Ollama running at `http://localhost:11434`
- About 20 GB or more of free space, depending on installed models

## Setup

Clone the repository and enter it:

```bash
git clone <repository-url>
cd personal-project
```

Run the setup script. It installs the required system tools, Python packages, and default Ollama models:

```bash
chmod +x setup.sh build.sh
./setup.sh
```

If Ollama was installed separately, start it and pull the default models manually:

```bash
ollama serve
ollama pull qwen3.5:9b
ollama pull scb10x/typhoon-translate1.5-4b
ollama pull legraphista/Orpheus:latest
```

`qwen3.5:9b` is the default Post-Session Analysis model used for analysis and exam generation. You can replace it in **Settings → Post-Session Analysis Model**. Larger models such as `qwen3.6:27b` require substantially more memory and disk space.

Install JavaScript dependencies:

```bash
npm install
```

## Run in development

Make sure Ollama is running, then start Electron with hot reload:

```bash
npm run dev
```

The local database and imported media are stored under:

```text
~/Library/Application Support/Daily Speaking/
```

## Tests and checks

```bash
npm test
npx tsc --noEmit -p tsconfig.web.json
npm run build
```

## Build the macOS DMG

Run the full build script:

```bash
./build.sh
```

The script installs dependencies, rebuilds `better-sqlite3` for Electron, builds the main/preload/renderer bundles, and packages the app. The release artifact is created at:

```text
release/Daily Speaking-<version>-arm64.dmg
```

To install it, open the DMG and drag **Daily Speaking** into **Applications**. The current local build is unsigned, so on first launch use Finder's **Right-click → Open** flow if macOS asks for confirmation.

## How the app works

1. **Import** — media is downloaded or read locally, audio is extracted, Whisper transcribes it, and the translation model produces Thai sentence translations.
2. **Practice** — Electron plays only the active sentence range. Recording attempts are transcribed and scored, while progress is persisted to SQLite.
3. **Review** — weak sentences and saved words become flashcards. Due Today follows the SRS schedule; Show All is a read-only library view.
4. **Analyze** — the configured Post-Session Analysis model summarizes weaknesses and extracts vocabulary/grammar.
5. **Exam** — after a session reaches 100%, the same analysis model creates a tagged comprehension quiz. Attempts, scores, selected answers, correct answers, and explanations are stored for history and retakes.

## Architecture

```text
Electron main process
├── SQLite and filesystem
├── FFmpeg / yt-dlp / Whisper
├── Ollama translation, analysis, TTS, and exam generation
└── IPC handlers
    └── React renderer (Dashboard, Sessions, Practice, Flashcards, Exams)
```

Heavy transcription and model work runs outside the React renderer so the interface stays responsive. Model names and the Ollama URL can be changed from Settings without changing application code.

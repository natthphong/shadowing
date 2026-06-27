Shadowing & Speaking Practice App Requirements

1. Product Overview

The application is a desktop language-learning app for English shadowing and speaking practice. Users can import videos, audio files, YouTube links, or pasted transcripts. The app transcribes the content, splits it into short practice sentences, translates each sentence into Thai, and allows users to practice speaking sentence by sentence.

The app should support local AI models as much as possible. It should help users improve pronunciation, rhythm, speaking speed, vocabulary, grammar, and sentence recall through repeated practice and spaced repetition.

The app can be built with Electron.

⸻

2. Main Goals

The app should help users:

1. Practice English shadowing from real video/audio content.
2. Learn sentence-by-sentence with original audio, transcript, and Thai translation.
3. Speak after the original sentence and receive pronunciation/rhythm feedback.
4. Translate words, selected text, full sentences, or full imported content.
5. Automatically detect weak sentences and mispronounced words.
6. Create flashcards from low-score sentences, vocabulary, and grammar.
7. Review learned sentences using an Anki-like spaced repetition system.
8. Build a personal grammar and vocabulary library from real content.
9. Track long-term progress through session history and dashboard analytics.

⸻

3. Platform Requirements

3.1 Desktop Application

The app should be a desktop app.

Recommended stack:

* Electron
* React / Next.js-style frontend
* Node.js backend or Python local service
* SQLite for local storage
* Local file storage for media, transcript, translations, recordings, and practice history

3.2 Local AI First

The app should prioritize local AI models.

Required local AI components:

* Speech-to-text model: Whisper large-v3-turbo
* Interactive Thai translation model: scb10x/typhoon-translate1.5-4b
* Bulk segment translation model: Qwen or Gemma family model
* Post-session analysis model: qwen3.6:27b

Cloud AI may be optional in the future, but the core app should be designed to work locally.

⸻

4. Input Sources

The app must support the following input sources.

4.1 YouTube Link

YouTube link import is a must-have feature.

Users should be able to paste a YouTube URL and create a learning session from it.

The app should support:

* Fetching available transcript if possible
* Downloading or extracting audio when needed
* Transcribing audio if transcript is unavailable or low quality
* Creating timestamped sentence segments
* Translating all segments into Thai
* Preparing sentence-by-sentence shadowing practice

4.2 Import Video File

Users can import local video files.

Supported examples:

* .mp4
* .mov
* .mkv

The app should extract audio using FFmpeg and transcribe it using Whisper large-v3-turbo.

4.3 Import Audio File

Users can import local audio files.

Supported examples:

* .mp3
* .wav
* .m4a
* .flac

The app should transcribe the audio and create practice-ready sentence segments.

4.4 Paste YouTube Transcript or Manual Transcript

Users can paste a transcript manually.

The app should:

* Parse the pasted transcript
* Split it into short sentence segments
* Translate each sentence into Thai
* Allow users to practice the transcript sentence by sentence

⸻

5. Transcription Requirements

5.1 Transcription Model

The app should use:

Whisper large-v3-turbo

This model is used for:

* Transcribing imported videos
* Transcribing imported audio
* Transcribing YouTube audio
* Transcribing user voice recordings during speaking practice

5.2 Transcription Output

The transcription system should produce detailed segment data.

Each segment should include:

* Segment ID
* Original English text
* Start timestamp
* End timestamp
* Duration
* Optional word-level timestamps
* Optional confidence score
* Source audio reference

Example:

{
  "id": "seg_001",
  "original": "It's an apple pie.",
  "start_time": 12.4,
  "end_time": 14.1,
  "duration": 1.7
}

5.3 Sentence Segmentation

The app should split long transcripts into short practice-friendly sentences.

A good sentence segment should be:

* Short enough to repeat
* Natural to speak
* Not too long for shadowing
* Timestamp-aligned with original audio
* Suitable for Thai translation

If Whisper produces long segments, the app should further split them into smaller sentence-level units while preserving timestamps as accurately as possible.

⸻

6. Translation Requirements

The app should support two types of translation.

⸻

6.1 Interactive Translation

Interactive translation is used when the user manually selects text.

The model should be:

scb10x/typhoon-translate1.5-4b

Interactive translation should support:

* Click a word to translate
* Select part of a sentence to translate
* Translate one full sentence
* Translate a general text snippet
* Show Thai meaning
* Optionally explain word usage or sentence meaning

Examples:

* User clicks: apple pie
* App shows: พายแอปเปิล
* User selects: What are you doing here?
* App shows Thai translation and possible tone/context

⸻

6.2 Bulk Segment Translation

Bulk translation is used during import.

When importing YouTube links, .mp4, .mp3, or other media, the app should translate many transcript segments at once.

Bulk translation should return strict JSON.

The app may use a more capable model such as:

* Qwen
* Gemma
* Another local instruction model that can reliably return JSON

The app should send batches of around 20–30 segments per request.

Input example:

[
  {
    "id": "seg_001",
    "original": "It's an apple pie."
  },
  {
    "id": "seg_002",
    "original": "I made it this morning."
  }
]

Expected output:

[
  {
    "id": "seg_001",
    "original": "It's an apple pie.",
    "translate": "มันคือพายแอปเปิล"
  },
  {
    "id": "seg_002",
    "original": "I made it this morning.",
    "translate": "ฉันทำมันเมื่อเช้านี้"
  }
]

6.3 Bulk Translation Rules

The bulk translation model must follow these rules:

1. Return valid JSON only.
2. Preserve the original segment ID.
3. Preserve the original English text.
4. Add Thai translation in the translate field.
5. Do not merge segments.
6. Do not reorder segments.
7. Do not remove segments.
8. Do not add explanations inside the JSON translation response.
9. If unsure, still provide the best natural Thai translation.
10. Keep translation natural but close enough to the original sentence for language learning.

6.4 Translation Storage

Each translated segment should be stored locally.

The app should store:

* Original sentence
* Thai translation
* Translation model used
* Translation timestamp
* Source session
* Whether translation was auto-generated or manually edited

Users should be able to edit the Thai translation manually.

⸻

7. Shadowing Practice Mode

7.1 Sentence-by-Sentence Playback

The app should play the original audio one sentence at a time.

For each sentence, users should be able to:

* Play original sentence
* Replay current sentence
* Go to previous sentence
* Go to next sentence
* Loop current sentence
* Show or hide Thai translation
* Show or hide English transcript
* Adjust playback speed
* Record their own voice
* Replay their own recording

7.2 Practice Flow

The expected practice flow:

1. User opens a session.
2. App shows the current sentence.
3. App plays the original audio for that sentence.
4. User speaks after the original.
5. App records the user’s voice.
6. App transcribes the user’s voice using Whisper large-v3-turbo.
7. App compares the user transcript with the original sentence.
8. App calculates scores.
9. App gives feedback.
10. User retries or moves to the next sentence.

⸻

8. User Speech Comparison

8.1 User Recording

For each practice attempt, the app should store:

* Recording audio path
* Target sentence
* User transcript
* Attempt timestamp
* Accuracy score
* Pronunciation score
* Rhythm score
* Speed score
* Overall score
* Feedback result

8.2 Comparison Logic

The app should compare:

* Original sentence vs user transcript
* Missing words
* Incorrect words
* Extra words
* Word order issues
* Speaking speed
* Timing difference
* Rhythm similarity
* Repeated pronunciation mistakes

8.3 Scoring Categories

Each attempt should generate:

{
  "accuracy_score": 82,
  "pronunciation_score": 75,
  "rhythm_score": 68,
  "speed_score": 80,
  "overall_score": 76
}

8.4 Low Score Detection

The app should mark a sentence as low score when:

* Overall score is below the configured threshold
* Pronunciation score is low
* The user repeatedly misses the same word
* The user marks the sentence as difficult
* The AI analysis model recommends review

Low-score sentences should be added to the review system automatically.

⸻

9. AI Feedback Modes

The app should support two feedback modes.

⸻

9.1 Mode 1: Feedback After Every Sentence

After each sentence attempt, the app should provide immediate feedback.

The feedback should include:

* Words likely pronounced incorrectly
* Missing words
* Extra words
* Rhythm and speed comparison
* Words that should be practiced again
* Thai translation
* Explanation of useful expressions or idioms
* Suggested retry advice

This feedback can use a lightweight local model or the post-session analysis model depending on performance.

⸻

9.2 Mode 2: Post-Session Summary and Analysis

After the user finishes practicing a clip, the app should analyze the full session using:

qwen3.6:27b

The post-session analysis should summarize:

* Overall speaking performance
* Sentences with low scores
* Words the user often mispronounced
* Vocabulary that should be practiced
* Sentences that should be added to review
* Grammar patterns found in the transcript
* Tenses found in the transcript
* Idioms and useful expressions
* Recommended next practice focus

⸻

10. Post-Session Learning Item Generation

After a session is completed, the app should use qwen3.6:27b to generate structured learning items.

The model should analyze:

* Full transcript
* All sentence scores
* User transcripts
* Mispronounced words
* Low-score sentences
* Retry count
* User difficulty ratings

The model should output structured JSON.

Example output:

{
  "summary": {
    "overall_feedback": "You did well with short questions, but struggled with connected speech and sentence rhythm.",
    "main_weaknesses": ["linking sounds", "final consonants", "speaking speed"]
  },
  "sentences_to_review": [
    {
      "sentence_id": "seg_012",
      "original": "What are you doing here?",
      "translate": "คุณมาทำอะไรที่นี่",
      "reason": "Low rhythm score and missing word 'are'",
      "priority": "high"
    }
  ],
  "words_to_practice": [
    {
      "word": "actually",
      "translate": "จริง ๆ แล้ว",
      "reason": "Frequently missed or unclear pronunciation",
      "priority": "high"
    }
  ],
  "grammar_items": [
    {
      "name": "Present Continuous",
      "pattern": "Subject + am/is/are + V-ing",
      "explanation_th": "ใช้พูดถึงสิ่งที่กำลังเกิดขึ้นในขณะนั้น",
      "examples": [
        {
          "original": "What are you doing here?",
          "translate": "คุณกำลังทำอะไรอยู่ที่นี่"
        }
      ]
    }
  ]
}

⸻

11. Grammar Knowledge Base

11.1 Grammar Extraction

At the end of each session, the app should extract grammar points from the full transcript.

Examples:

* Present Simple
* Present Continuous
* Past Simple
* Present Perfect
* Future forms
* Modal verbs
* Question forms
* Passive voice
* Conditional sentences
* Comparative and superlative forms
* Phrasal verbs
* Idioms
* Common expressions

11.2 Grammar Deduplication

The app should not duplicate grammar topics.

If a grammar topic already exists, the app should:

* Add new example sentences
* Update last seen date
* Link the new session as another source
* Avoid creating a duplicate grammar record

11.3 Grammar Library

The grammar library should include:

* Grammar name
* Thai explanation
* Structure/pattern
* Example sentences
* Thai translations
* Source sessions
* Last reviewed date
* Review status

Users should be able to click any grammar item and review it later.

⸻

12. Session History

The app should store all practice sessions.

Each session should include:

* Session ID
* Source type
* Source title
* Source URL if YouTube
* Local media path if imported file
* Created date
* Full transcript
* Segment list
* Translation list
* User attempts
* Scores
* AI feedback
* Low-score sentences
* Extracted vocabulary
* Extracted grammar
* Practice duration
* Completion percentage

Users should be able to reopen old sessions and continue practicing.

⸻

13. Flashcard System

The app should automatically create flashcards from weak learning points.

Flashcard sources:

* Low-score sentences
* Mispronounced words
* Difficult vocabulary
* Useful expressions
* Grammar items
* Thai-to-English speaking practice sentences

The app should support Anki-like spaced repetition.

⸻

14. Flashcard Types

14.1 Vocabulary Card

Front:

Thai meaning

Back:

English word
Pronunciation guide
Example sentence
Thai translation
Source session

14.2 Sentence Speaking Card

Front:

Thai translation

Back:

English sentence
Original audio
Hint
Explanation
Record button
Speech comparison result

14.3 Pronunciation Card

Front:

Word or phrase to pronounce

Back:

Correct word or phrase
Original audio
User recording
Pronunciation feedback

14.4 Grammar Card

Front:

Grammar topic or example sentence

Back:

Thai explanation
Grammar structure
Example sentences
Common mistakes

⸻

15. Spaced Repetition System

The app should include an Anki-like review system.

After each review, users rate the card:

* Very Easy
* Easy
* Hard
* Very Hard

The rating should affect the next due date.

Suggested behavior:

* Very Easy: move next review much further away
* Easy: move next review further away
* Hard: review again soon
* Very Hard: review very soon

Each card should store:

* Card type
* Source session
* Difficulty rating
* Review count
* Correct count
* Incorrect count
* Ease factor
* Interval days
* Next due date
* Last reviewed date

⸻

16. Sentence Speaking Review Mode

The app should support review for sentences the user has already practiced.

16.1 Thai-to-English Speaking Review

The app shows the Thai translation first.

The user must speak the English sentence from memory.

The app should provide:

* Thai prompt
* Hint button
* Reveal answer button
* Record button
* Speech-to-text comparison
* Score
* Self-rating buttons:
    * Very Easy
    * Easy
    * Hard
    * Very Hard

16.2 Hint System

Hints may include:

* First word
* Sentence length
* Key vocabulary
* Grammar pattern
* Partial sentence
* Original audio replay

16.3 Review Scheduling

The review system should prioritize:

* Cards due today
* Low-score sentences
* Very Hard cards
* Frequently mispronounced words
* Recently failed cards

Cards that users rate as easy should appear less often.

⸻

17. Dashboard Requirements

The app should include a dashboard for learning progress.

17.1 Main Metrics

The dashboard should show:

* Total practiced sentences
* Total unique vocabulary learned
* Total reviewed flashcards
* Total due flashcards
* Total completed sessions
* Total practice time
* Average speaking score
* Pronunciation improvement over time
* Number of low-score sentences
* Number of grammar topics discovered

17.2 Vocabulary Metrics

The dashboard should show:

* Unique vocabulary count
* New vocabulary this week
* Difficult vocabulary
* Most repeated pronunciation mistakes
* Vocabulary due for review

17.3 Sentence Metrics

The dashboard should show:

* Total sentences practiced
* Sentences mastered
* Sentences needing review
* Average sentence score
* Lowest-score sentences
* Most retried sentences

17.4 Grammar Metrics

The dashboard should show:

* Grammar topics encountered
* Tenses encountered
* Grammar topics reviewed
* Grammar topics not yet reviewed
* Example sentences from real sessions

Each grammar topic should be clickable.

⸻

18. Data Storage Requirements

The app should store data locally by default.

Recommended database:

SQLite

Main entities:

* Source
* Session
* Transcript
* Segment
* Translation
* User recording
* Practice attempt
* Feedback
* Vocabulary item
* Grammar item
* Flashcard
* Review history
* Model job history

⸻

19. Suggested Data Model

19.1 Source

{
  "id": "source_001",
  "type": "youtube",
  "title": "English Conversation Clip",
  "url": "https://youtube.com/...",
  "local_media_path": "/media/source_001.mp4",
  "created_at": "2026-06-27T10:00:00"
}

19.2 Segment

{
  "id": "seg_001",
  "session_id": "session_001",
  "original": "It's an apple pie.",
  "translate": "มันคือพายแอปเปิล",
  "start_time": 12.4,
  "end_time": 14.1,
  "duration": 1.7,
  "translation_model": "qwen-or-gemma",
  "transcription_model": "whisper-large-v3-turbo"
}

19.3 Practice Attempt

{
  "id": "attempt_001",
  "segment_id": "seg_001",
  "user_transcript": "It's apple pie",
  "audio_path": "/recordings/attempt_001.wav",
  "accuracy_score": 80,
  "pronunciation_score": 72,
  "rhythm_score": 68,
  "speed_score": 75,
  "overall_score": 74,
  "created_at": "2026-06-27T10:05:00"
}

19.4 Flashcard

{
  "id": "card_001",
  "type": "sentence_speaking",
  "front": "มันคือพายแอปเปิล",
  "back": "It's an apple pie.",
  "source_segment_id": "seg_001",
  "difficulty": "hard",
  "interval_days": 1,
  "ease_factor": 2.5,
  "next_due_at": "2026-06-28T10:00:00"
}

19.5 Grammar Item

{
  "id": "grammar_001",
  "name": "Present Continuous",
  "pattern": "Subject + am/is/are + V-ing",
  "explanation_th": "ใช้พูดถึงสิ่งที่กำลังเกิดขึ้นในขณะนั้น",
  "examples": [
    {
      "original": "What are you doing here?",
      "translate": "คุณกำลังทำอะไรอยู่ที่นี่",
      "source_segment_id": "seg_012"
    }
  ]
}

⸻

20. Import Pipeline

20.1 YouTube Import Pipeline

The YouTube import flow should be:

1. User pastes YouTube URL.
2. App fetches metadata.
3. App checks if transcript is available.
4. If transcript is available, import transcript.
5. If transcript is unavailable or poor quality, extract/download audio.
6. Transcribe audio using Whisper large-v3-turbo.
7. Split transcript into short sentence segments.
8. Translate segments in bulk.
9. Save transcript and translations.
10. Create a new practice session.

20.2 Local Video/Audio Import Pipeline

The local media import flow should be:

1. User selects .mp4, .mp3, or other supported file.
2. App extracts audio if needed.
3. App transcribes audio using Whisper large-v3-turbo.
4. App creates timestamped sentence segments.
5. App translates segments in bulk.
6. App saves everything locally.
7. App opens the session in shadowing mode.

20.3 Bulk Translation Pipeline

The bulk translation flow should be:

1. Collect 20–30 untranslated segments.
2. Send them to translation model as JSON.
3. Require JSON-only response.
4. Validate JSON.
5. Retry if invalid JSON.
6. Save translations to database.
7. Continue until all segments are translated.

⸻

21. Model Responsibilities

21.1 Whisper large-v3-turbo

Used for:

* Transcribing imported audio/video
* Transcribing YouTube audio
* Transcribing user recordings
* Creating timestamped transcript segments

21.2 scb10x/typhoon-translate1.5-4b

Used for:

* Word translation
* Selected text translation
* Sentence translation on demand
* General interactive translation

21.3 Qwen or Gemma Translation Model

Used for:

* Bulk translation during import
* JSON segment translation
* Translating 20–30 transcript segments per request
* Returning strict JSON

21.4 qwen3.6:27b

Used for:

* Post-session summary
* Pronunciation and speaking weakness analysis
* Low-score sentence analysis
* Vocabulary extraction
* Grammar extraction
* Flashcard recommendation
* Review item generation
* Idiom and expression explanation

⸻

22. MVP Scope

MVP 1: Import and Shadowing

Must include:

1. Electron desktop app
2. YouTube link import
3. Local video/audio import
4. Whisper large-v3-turbo transcription
5. Sentence segmentation
6. Bulk Thai translation
7. Sentence-by-sentence playback
8. Replay / previous / next controls
9. Show/hide Thai translation
10. User voice recording
11. User speech transcription
12. Basic comparison score
13. Session history

⸻

MVP 2: AI Feedback and Analysis

Add:

1. Feedback after each sentence
2. Post-session analysis using qwen3.6:27b
3. Low-score sentence detection
4. Mispronounced word detection
5. Vocabulary extraction
6. Idiom and expression explanation
7. Recommended practice list

⸻

MVP 3: Flashcards and Review

Add:

1. Sentence flashcards
2. Vocabulary flashcards
3. Pronunciation flashcards
4. Grammar flashcards
5. Anki-like spaced repetition
6. Thai-to-English speaking review
7. Hint and reveal-answer system
8. Due card scheduling

⸻

MVP 4: Dashboard and Grammar Library

Add:

1. Learning dashboard
2. Grammar knowledge base
3. Grammar deduplication
4. Vocabulary library
5. Progress tracking
6. Score trends
7. Review analytics

⸻

23. Non-Functional Requirements

23.1 Performance

The app should handle long videos by processing in stages.

The UI should show progress for:

* YouTube import
* Audio extraction
* Transcription
* Sentence segmentation
* Bulk translation
* Practice analysis
* Flashcard generation

23.2 Offline Support

After models are installed, the app should work offline for local video/audio files.

YouTube import may require internet access.

23.3 Privacy

All user recordings, transcripts, translations, and practice history should be stored locally by default.

23.4 Reliability

The app should auto-save progress.

Users should be able to close the app and continue later.

23.5 Model Replaceability

The app should allow replacing models in the future.

Examples:

* Replace Whisper model
* Replace translation model
* Replace post-session analysis model
* Add cloud fallback
* Add better pronunciation scoring model

⸻

24. Success Criteria

The app is successful when users can:

1. Paste a YouTube link and create a practice session.
2. Import .mp4 or .mp3 files and create a practice session.
3. Generate accurate timestamped transcript segments using Whisper large-v3-turbo.
4. Translate all segments into Thai.
5. Practice sentence by sentence with original audio.
6. Record their own speech and compare it with the original.
7. Receive useful feedback about pronunciation, rhythm, speed, and weak words.
8. Generate post-session summaries using qwen3.6:27b.
9. Automatically create flashcards from weak sentences and vocabulary.
10. Review sentences using Thai-to-English speaking practice.
11. Track progress through dashboard metrics.
12. Build a personal grammar and vocabulary library from real practiced content.

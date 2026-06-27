---
name: Linguistic Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424754'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#516070'
  on-secondary: '#ffffff'
  secondary-container: '#d5e4f8'
  on-secondary-container: '#576676'
  tertiary: '#006947'
  on-tertiary: '#ffffff'
  tertiary-container: '#00855b'
  on-tertiary-container: '#f5fff6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#d5e4f8'
  secondary-fixed-dim: '#b9c8db'
  on-secondary-fixed: '#0e1d2b'
  on-secondary-fixed-variant: '#3a4858'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  transcript-th:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.5'
    letterSpacing: '0'
  transcript-en:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  ipa-label:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1'
    letterSpacing: 0.05em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 260px
  content-max-width: 1200px
  gutter: 24px
  stack-gap: 16px
  component-padding-x: 12px
  component-padding-y: 8px
---

## Brand & Style
The design system focuses on "Cognitive Clarity"—a philosophy that minimizes visual friction to maximize linguistic focus. It is tailored for a macOS environment, leveraging a blend of **Minimalism** and **Corporate Modern** aesthetics. The target audience consists of dedicated language learners who value tool-like reliability and high-tech capabilities (AI-driven shadowing).

The UI should feel like a native professional utility: stable, responsive, and intelligently organized. By utilizing generous whitespace and a "Quiet UI" approach, the design ensures that complex data—such as IPA transcriptions and bilingual text—remains legible and non-intimidating.

## Colors
The palette is rooted in a "High-Contrast Utility" logic. The **Primary Blue** is reserved strictly for interactive intent (CTA buttons, active states, playback progress). The **Secondary Sky Blue** serves as a structural "wash" to group related content without creating heavy visual boundaries.

- **Backgrounds:** Use `#FFFFFF` for the main content canvas and `#F9FAFB` for the sidebar and secondary panels to create a subtle depth hierarchy.
- **Semantic Colors:** Use a vibrant Green (`#10B981`) specifically for successful AI model status (Ollama/Whisper) and pronunciation accuracy. Use a soft Amber (`#F59E0B`) for "Model Loading" or "Processing" states.

## Typography
Typography is the core of the learning experience. This design system prioritizes the "Transcript" level, ensuring Thai characters have sufficient line-height to avoid clipping tone marks.

- **Dual-Language Scaling:** Thai text is set 25% larger than English translations to maintain visual parity in legibility.
- **Technical Accents:** `JetBrains Mono` is used for IPA (International Phonetic Alphabet) and AI status labels to provide a "data-driven" look that distinguishes metadata from the language being learned.
- **Hierarchical Depth:** Use `Slate-900` for primary text and `Slate-500` for secondary translations/metadata.

## Layout & Spacing
The layout follows a **Fixed Sidebar / Fluid Content** model typical of macOS desktop applications.

- **Sidebar:** A constant 260px left-hand navigation containing the library, AI settings, and session history.
- **Workspace:** A two-pane layout within the content area. The top (or left) pane hosts the video/audio player, while the bottom (or right) pane hosts the scrollable transcript.
- **Rhythm:** Use an 8px grid system. Standard component gaps are 16px, while section margins are 24px. The layout should feel "airy" to reduce the cognitive load of intense shadowing sessions.

## Elevation & Depth
This design system uses **Tonal Layers** rather than heavy shadows to denote hierarchy.

- **Level 0 (Base):** `#F9FAFB` for the application frame and sidebar.
- **Level 1 (Card):** `#FFFFFF` with a 1px border of `#E2E8F0`. No shadow. Used for the main transcript container.
- **Level 2 (Active/Floating):** Use a subtle ambient shadow (`0 4px 6px -1px rgb(0 0 0 / 0.05)`) for popovers, dropdowns, or active playback cards to lift them slightly from the canvas.
- **Focus States:** High-visibility 2px outer glow using the primary blue at 30% opacity.

## Shapes
Shapes are modern and approachable. A consistent **0.5rem (8px)** radius is the standard for most containers.

- **Buttons & Inputs:** 8px radius.
- **Large Sections/Video Players:** 16px (`rounded-xl`) to create a "containerized" feel.
- **Status Indicators:** Fully circular (Pill) for AI status lights and progress badges.
- **Active State Highlights:** The selection bar in the sidebar should have a 6px radius and 4px of horizontal inset from the sidebar edge.

## Practice Screen Layout (v0.0.7)

The Practice page uses a **bounded flex column** layout so all controls remain visible
regardless of sentence length or window size:

- The left column is `overflow-hidden` with `pb-20` to reserve space for the fixed
  floating bottom bar.
- The focus card (`<section>`) is `flex-1 min-h-0 overflow-hidden`, filling all
  remaining vertical space after the optional video player.
- Inside the card: **fixed top** (controls + counter), **flex-1 sentence area**,
  **fixed bottom** (subtitle, translation popup, feedback chip, transport controls,
  progress bar) — all three areas use `shrink-0` except the middle.
- **50/50 vertical split** when a video source is loaded: the video player and the
  practice card each get `flex-1 min-h-0` so they share the left column height equally.
  Without video, the practice card takes the full left column height.
- **Dynamic font sizing** (`useAutoFitText` hook — `src/renderer/src/hooks/`):
  a ResizeObserver binary-searches the largest `font-size` (18 – 52 px).
  The hook targets the **outer centering div** (`sentenceBoxRef`) but measures
  `inner.scrollHeight` (the flex-wrap word container, `firstElementChild`) against
  `outer.clientHeight` — this avoids a Chromium quirk where `align-content: center`
  makes `scrollHeight === clientHeight` regardless of actual content size, which
  previously caused the font to always stay at `maxPx`.
  Gaps between words are `em`-relative so they scale proportionally.
  Initial run uses double-rAF to ensure flex layout is settled before measuring.
  Re-runs on every segment change and on window resize.

## Components
- **Shadowing Cards:** The active phrase being played should have a `Secondary Blue` background and a thick `Primary Blue` left-border (4px) to clearly indicate the user's current focus.
- **Toggle Switches:** Used for IPA and Translation visibility. Use a macOS-style toggle: small, rounded, with the primary blue for the "on" state.
- **AI Status Pill:** A compact component in the sidebar footer. It features a pulsing dot (Green/Amber/Gray) next to the model name (e.g., "Ollama: Llama3") in `JetBrains Mono`.
- **Playback Controls:** Large, centered icons with high hit-targets. The "Repeat Loop" button is a primary action; when active, it should use the primary blue background with a white icon.
- **Transcripts:** Each line is a clickable "row" component. Hovering over a row should show a subtle `#F1F5F9` background change.
- **Sidebar Nav:** Uses "ghost" styling—text and icons are neutral grey, becoming Primary Blue only when the item is active, accompanied by a light blue background tint.
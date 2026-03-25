# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Video is a pluggable video production pipeline that automates narrated demo videos. An AI agent interacts with a web app via Chrome DevTools MCP while screencast recording captures every frame with animated cursor overlays. Claude then writes narration timed to the footage, and the pipeline renders a polished video via Remotion. Core philosophy: **record once, narrate and render many** + **pluggable providers** (free ↔ premium) + **narration drives video timing** (footage stretches/compresses to match narration audio).

## The Pipeline (read this first)

**Screencast Record → Claude writes narration.json → Pipeline renders MarketingDemo → Video**

The screencast pipeline is the PRIMARY way to produce demo videos. It uses a Chrome DevTools MCP fork with built-in screencast recording, SVG cursor animation, and auto-segmentation.

### How it works

1. **Record** — Chrome DevTools MCP fork (`/home/jordan/chrome-devtools-mcp-fork`) runs with `--human-mode --experimental-screencast --isolated`. Open a page, call `screencast_start`, interact with the app (click, fill, scroll, etc.), then `screencast_stop`. The fork handles: SVG cursor animation on clicks/fills, auto-segmentation (pauses recording after 15s idle, resumes on next action or `wait_for` completion), timeline JSONL logging, and webm-to-mp4 conversion with segment concatenation.
2. **Narrate** — Claude writes `narration.json` by hand based on what happened during recording. Each segment has explicit `videoStartSec`/`videoEndSec` pointing at the relevant footage. This is intentionally manual — Claude watches the recording and writes narration timed to the action.
3. **Render** — `node scripts/screencast-pipeline.mjs <recording.mp4> [timeline.jsonl] --skip-narration` runs the 9-step pipeline: narration-driven video editing (each video segment stretches/compresses to match narration audio duration) → TTS → Whisper word timings → Remotion renders MarketingDemo composition with IntroCard, narrated footage, WordHighlightCaptions, and OutroCard.

**Narration drives video timing, not the other way around.** The `buildNarrationDrivenEditList` function in `lib/video-editor.mjs` maps each narration segment to a slice of the source footage, then speeds up or slows down that slice to match the TTS audio duration. This means you can re-narrate the same footage with different scripts and get different edit timings.

**The segment manager auto-pauses/resumes.** Long waits (e.g., AI generation in the app) get cut automatically because the screencast pauses after 15s of idle and resumes when the next action fires or a `wait_for` completes.

**Cross-origin iframes cannot be scrolled** via DevTools protocol. Navigate directly to the target page instead of trying to scroll within an iframe.

### narration.json format

```json
{
  "introTagline": "Build a Website in 60 Seconds",
  "introSubtitle": "Traffic Stores AI Website Builder",
  "outroHeading": "Create yours free at trafficstores.ca",
  "outroUrl": "trafficstores.ca",
  "outroCtaText": "Start Free",
  "accentColor": "rgba(16, 185, 129, 1)",
  "segments": [
    {
      "text": "Narration text here",
      "sceneIndex": 0,
      "sceneLabel": "Sign Up",
      "videoStartSec": 3.7,
      "videoEndSec": 9.4
    }
  ],
  "fullText": "All segments joined..."
}
```

`introTagline`, `introSubtitle`, `outroHeading`, `outroUrl`, `outroCtaText`, and `accentColor` are passed through to IntroCard/OutroCard props. Each segment's `videoStartSec`/`videoEndSec` select the footage slice for that narration — useful when footage is not in timeline order or when scroll recordings were concatenated separately.

### Slash Commands
- `/demo` — Full automated pipeline: plan from knowledge base → record screencast → narrate → render

### Secondary: ScoutReplay screenshot path (not tested e2e)
The ScoutReplay path (`node cli.mjs scout-to-video`) renders frame-by-frame from screenshots + JSONL walkthrough data. Claude scouts the app, screenshots are captured at each visual state change, and Remotion animates cursor movement, zooms, crossfades, and typing overlays between screenshot pairs. This path was never tested end-to-end and is not recommended.

### Legacy: agent-browser recording path (broken)
The `full` command and `lib/run.mjs` used agent-browser (Mux's headless browser CLI) for real-time screen recording with a fake SVG cursor. This path is broken and no longer maintained. It required hand-written scene modules (e.g. `examples/pos-demo/scenes/full-demo.mjs`).

## Commands

### Screencast Pipeline (primary)
```bash
node cli.mjs screencast <recording.mp4> [timeline.jsonl]          # Full screencast pipeline
node scripts/screencast-pipeline.mjs <recording> [timeline] \
  --preset draft --skip-narration --name <name>                    # With options
node scripts/screencast-audit.mjs screencast-output/               # Check narration/video alignment
```
9-step pipeline: read narration.json → narration-driven video edit → TTS → Whisper word timings → assemble MarketingDemo props → Remotion render → h265 optimize → output to `screencast-output/`.

### Root project (ESM, Node.js)
```bash
npm run full <walkthrough.jsonl>     # Legacy: JSONL → TTS → render (broken)
npm run full:draft <walkthrough>     # Legacy: Draft preset
npm run full:production <walkthrough># Legacy: Production preset
npm run convert <jsonl>              # JSONL walkthrough → manifest + Remotion props
npm run tts <manifest>               # Generate TTS audio only
npm run render <dir>                 # Remotion post-production only
npm run render:all <dir>             # Multi-format export (landscape + vertical + square)
npm run marketing                    # Marketing pipeline (presenter + lip sync + markers)
npm run stitch                       # Combine multiple videos with transition cards
npm run preview                      # Start Remotion Studio for live preview
npm run providers                    # List available TTS/avatar providers
```

### Marketing Pipeline (`scripts/marketing-pipeline.mjs`)
```bash
node scripts/marketing-pipeline.mjs <recording-dir> \
  --markers examples/pos-demo/register-markers.json \
  --name my-demo
```
10-step pipeline: copy video → probe duration → Whisper transcription → Rhubarb lip sync → match segment markers → build lower thirds + zoom regions → assemble MarketingDemo props → Remotion render → h265 optimize → output to `final-output/`.

### Stitch (`scripts/stitch.mjs`)
```bash
node scripts/stitch.mjs \
  --parts final-output/part1.mp4 final-output/part2.mp4 \
  --output final-output/combined.mp4 \
  --transition-heading "Section Two" \
  --transition-subtitle "Going deeper" \
  --outro-trim 6 --intro-skip 8
```
Validates inputs → renders TransitionCard via Remotion → trims part endings/beginnings → concat demuxer join → h265 optimize.

### Remotion project (`demo-render/`)
```bash
cd demo-render
npx remotion studio                  # Live preview with hot reload
npx remotion render src/index.ts MarketingDemo  # Render marketing demo (primary)
npx remotion render src/index.ts ScoutReplay    # Render scout replay (secondary)
```

No test runner or linter is configured.

## Architecture

### Screencast Recording Engine

The screencast pipeline uses a Chrome DevTools MCP fork at `/home/jordan/chrome-devtools-mcp-fork` with flags `--human-mode --experimental-screencast --isolated`. The MCP server config is in `.mcp.json`. The recording flow:

1. Open a page via `navigate_page` or `new_page`
2. Call `screencast_start` to begin recording
3. Interact with the app (click, fill, type, scroll, wait_for, etc.) — the fork renders an animated SVG cursor on all click/fill actions
4. The segment manager auto-pauses recording after 15s of idle, resumes on the next action or `wait_for` completion — this automatically cuts dead time from long waits (e.g., AI generation)
5. Call `screencast_stop` — the fork concatenates segments, converts webm to mp4, and writes a timeline JSONL
6. Claude writes `narration.json` with explicit `videoStartSec`/`videoEndSec` per segment based on watching the recording
7. Run `node scripts/screencast-pipeline.mjs` to render the final video

### Legacy Recording Engine (lib/run.mjs + lib/ab.js) — broken

The legacy recording engine used **agent-browser** (Mux's headless browser CLI). This path is broken and no longer maintained. The flow was: generate TTS → budget preflight → open headed Chromium via agent-browser → inject fake SVG cursor → screen record while executing scene module → merge raw .webm + narration audio via ffmpeg.

### Scene Modules

Scene modules are the creative input — JS files that script browser actions timed to narration. They receive a context object:

```javascript
export default async function run(ctx) {
  const { ab, cursorClick, injectCursor, waitUntil, seg, sleep } = ctx;
  await waitUntil(seg("intro").endSec);           // Wait for narration segment
  await cursorClick("button:has-text('Login')");   // Animated cursor click
  ab(`keyboard type "1234"`);                      // agent-browser command
  await sleep(1000);                               // Pause
}
```

See `examples/pos-demo/scenes/full-demo.mjs` for the reference implementation.

### Manifest Format

A manifest (`manifest.json`) pairs narration segments with a scene module:

```json
{
  "name": "pos-demo",
  "baseUrl": "http://localhost:3010/pos",
  "scenes": [{
    "name": "full-demo",
    "module": "scenes/full-demo.mjs",
    "url": "http://localhost:3010/pos",
    "narration": [
      { "text": "Here's a quick look at the register.", "action": "intro" },
      { "text": "Products can be searched and tapped.", "action": "search-add" }
    ]
  }]
}
```

Each narration segment's `action` name maps to `seg("action-name")` calls in the scene module for timing sync.

### Provider System

All external services are swappable via CLI flags (`--tts`, `--avatar`) or env vars (`TTS_PROVIDER`, `AVATAR_PROVIDER`). Each provider module exports a common interface and returns normalized output.

| Category | Providers |
|----------|-----------|
| TTS | `elevenlabs` (premium, char-level timestamps) · `edge` (free, 100+ voices) · `kokoro` (local, offline) |
| Avatar | `sadtalker` (local GPU) · `liveportrait` · `echomimic` (stubs) · `none` |
| Transcription | whisper.cpp via `@remotion/install-whisper-cpp` |
| Rendering | Local Remotion · AWS Lambda (`lib/lambda.mjs`) |

Provider routers live in `lib/tts/index.js` and `lib/avatar/index.js`.

### Key Modules

| Module | Role |
|--------|------|
| `cli.mjs` | CLI dispatcher; routes subcommands to modules |
| `scripts/screencast-pipeline.mjs` | **Screencast pipeline** (primary): 9-step flow (narration.json → video edit → TTS → Whisper → render → optimize) |
| `scripts/screencast-audit.mjs` | **Screencast audit**: check narration/video alignment before render |
| `lib/video-editor.mjs` | **Narration-driven video editing**: `buildNarrationDrivenEditList` maps narration segments to footage slices with speed adjustment |
| `.mcp.json` | MCP server config — points to Chrome DevTools MCP fork with `--human-mode --experimental-screencast --isolated` |
| `scripts/marketing-pipeline.mjs` | **Marketing pipeline**: 10-step flow (video → Whisper → Rhubarb → markers → render → optimize) |
| `scripts/stitch.mjs` | **Video stitcher**: combine multiple videos with transition cards via concat demuxer |
| `lib/whisper.mjs` | Whisper.cpp transcription with BPE-aware word-level timestamps (DTW alignment) |
| `lib/log-devtools-action.mjs` | PostToolUse hook — appends structured JSONL during Scout phase |
| `lib/render.js` | FFmpeg operations (merge audio/video, burn captions, concat scenes) |
| `scripts/jsonl-to-manifest.mjs` | Walkthrough JSONL → recording manifest |
| `scripts/jsonl-to-remotion-props.mjs` | Walkthrough JSONL → Remotion scene graph props |
| `scripts/jsonl-to-scout-props.mjs` | Walkthrough JSONL → ScoutReplay props |
| `scripts/generate-narration.mjs` | AI narration generation from walkthrough data |
| `demo-render/pipeline.mjs` | Post-production orchestration (Whisper → props → render → verify) |
| `demo-render/src/MarketingDemo.tsx` | **Primary composition**: screencast footage + intro/outro + captions + narration |
| `demo-render/src/ScoutReplay.tsx` | **Secondary composition**: frame-by-frame rendering from screenshots + JSONL (not tested e2e) |
| `demo-render/src/Demo.tsx` | **Legacy composition**: screen recording-based (broken) |
| `scripts/pitch-video-pipeline.mjs` | **Pitch video pipeline**: markdown script → images (OpenAI) → TTS → Whisper sync → timeline audit → Remotion render |
| `scripts/generate-timeline-audit.mjs` | **Timeline audit**: machine-readable scene/audio alignment check — run before renders to catch misalignments |
| `scripts/generate-pitch-images.js` | **Image generation**: batch OpenAI GPT Image 1.5 scene image generation |
| `scripts/assemble-pitch-v2.mjs` | Manual assembly script for fine-tuned scene-to-image mapping |
| `lib/run.mjs` | Legacy recording engine (broken) |
| `lib/ab.js` | Legacy agent-browser command wrapper (broken) |
| `lib/cursor.js` | Legacy fake SVG cursor injection (superseded by MCP fork's built-in cursor) |
| `lib/budget.js` | Legacy timeline budget calculator |
| `mcp-server/index.js` | MCP server exposing `create_narrated_recording` tool |

### Remotion Compositions

**MarketingDemo.tsx** (primary) — Used by both the screencast pipeline and the marketing pipeline. IntroCard (accepts `introTagline`, `introSubtitle`, `accentColor`) → light leak transition → main content (narration-edited screen recording + WordHighlightCaptions + LowerThirds + ProgressBar + optional Presenter avatar with Rhubarb lip sync + music bed) → fade → OutroCard (accepts `outroHeading`, `outroUrl`, `outroCtaText`, `accentColor`). Used by `scripts/screencast-pipeline.mjs` and `scripts/marketing-pipeline.mjs`.

**ScoutReplay.tsx** (secondary, not tested e2e) — Frame-by-frame rendering from screenshot data + JSONL. Renders ScreenshotScene + AnimatedCursor + TypingAnimation per action. Between each screenshot pair, Remotion animates cursor bezier paths, spring-based zoom, crossfade transitions, click pulse effects, typing overlays, lower thirds.

**Demo.tsx** (legacy, broken) — Screen recording-based: IntroCard → TransitionClip → ZoomableVideo → OutroCard. Required agent-browser recording + hand-written scene modules.

### Whisper Word Timing

`lib/whisper.mjs` uses `@remotion/install-whisper-cpp` with the `large-v3-turbo` model and DTW timestamps enabled. Raw BPE tokens are merged into words using the space-prefix rule (tokens starting with space = new word boundary, e.g. `[" P", "OS"]` → "POS"). Word endMs is derived from the next word's startMs for consistent timing from a single alignment source.

### Markers Format (for marketing pipeline)

```json
{
  "markers": [
    { "action": "pin-login", "phrase": "sign in", "label": "Quick PIN Login",
      "zoom": { "focusX": 960, "focusY": 480, "scale": 1.3, "offsetSec": -1, "durationSec": 5 } },
    { "action": "outro", "phrase": "register in action", "label": null }
  ]
}
```

`phrase` is fuzzy-matched against Whisper transcript. `label` becomes a lower third. `zoom` defines a focus region.

### JSONL Walkthrough Format

Each Chrome DevTools MCP action is logged as a JSONL entry with: `ts`, `seq`, `session`, `tool`, `action`, `input`, and `context` (URL, element bounds, accessibility role/label, viewport, scrollY). This is the interchange format consumed by all downstream converters.

### Timeline Budget System

Actions have estimated costs in milliseconds (e.g., cursorClick: 1200ms, type: 200ms/char). Before recording each segment, `lib/budget.js` compares estimated action cost against narration duration. If actions exceed the available time, silence padding is inserted after the narration audio. Zero hardcoded timestamps — everything derives from TTS character timing + Whisper word timing.

### Pitch Video Pipeline

`scripts/pitch-video-pipeline.mjs` creates narrated pitch/explainer videos from a markdown script. Unlike the scout path (which captures a live app), the pitch path uses a mix of AI-generated images, real scouted screenshots, and custom images.

**Critical: Scene timing must use Whisper word boundaries, not character-ratio estimation.** The pipeline's `syncScenesToWordTimings()` function matches the first few words of each scene's narration text against Whisper word timings to find exact audio timestamps. This ensures slides change at the exact moment the narrator starts speaking that scene's content.

**Audio cutoff prevention:** The last scene automatically gets +3s padding so outro transition crossfades don't clip the final narration.

**Timeline audit** runs automatically before every render. It produces a machine-readable JSON mapping every scene transition to the exact narration words. Use `generate-timeline-audit.mjs` standalone or check the `runTimelineAudit()` output in the pipeline. Issues it catches:
- Scenes with no matching words (audio not aligned)
- Audio cutoff (video shorter than narration)
- Late crossfades (image keyword spoken before the image appears)

When reviewing a pitch video render, always run the timeline audit first and check for issues before re-rendering.

### Pitch Script Markdown Format

```markdown
## Scene 1 — Title

> Narration text in blockquotes.
> Multiple lines become one continuous narration.

**Visuals:** Description of what to show (used for image generation prompts).
```

The parser extracts narration from `>` blockquotes and visual descriptions from `**Visuals:**` sections. Scene durations come from either a duration table in the markdown or from Whisper word timing.

## Config Presets

- **draft** — Free TTS (edge), small Whisper model, no avatar, skip verification
- **production** — ElevenLabs TTS, medium Whisper, SadTalker avatar, full 35-point verify, optional Mux upload
- **offline** — Kokoro TTS, local Whisper, Ollama for narration, zero API calls

## Environment Variables

Key variables (see `.env.example` for full list):
- `ELEVENLABS_API_KEY` — Premium TTS
- `OPENAI_API_KEY` — Image generation (GPT Image 1.5)
- `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` — Video hosting
- `ANTHROPIC_API_KEY` — AI narration generation
- `TTS_PROVIDER` / `AVATAR_PROVIDER` — Provider overrides
- `WHISPER_MODEL` — Transcription model size
- `RENDERER` — `local` or `lambda`

## Output Directories

- `./screencast-output/` — Screencast pipeline working directory (edited video, audio, props, audit, final render)
- `~/Movies/agent-recordings/` — Session recordings (raw footage, audio, walkthrough data)
- `./final-output/` — Rendered video output (marketing pipeline)
- `./pitch-output/` — Pitch pipeline working directory (images, audio, props, audit)
- `./demo-render/public/` — Assets staged for Remotion (screen.mp4, avatar.mp4, word-timings.json)

## Codebase Conventions

- ESM throughout (`"type": "module"` in both package.json files)
- No bundler — raw Node.js with `.mjs` extensions for scripts, `.js` for library modules
- Remotion project uses TypeScript (`.tsx`/`.ts`) in `demo-render/src/`
- Provider pattern: router module (`index.js`) dispatches to provider modules that export a common interface
- Chrome DevTools MCP fork is the recording tool (not Playwright, not agent-browser). Config in `.mcp.json`.
- Narration is written by Claude by hand in `narration.json` — not auto-generated
- Props are derived programmatically from narration.json + walkthrough data

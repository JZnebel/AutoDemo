# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Video is a pluggable video production pipeline that automates narrated demo videos. An AI agent scouts a web app via Chrome DevTools MCP, capturing screenshots and element interaction data. Remotion then renders a polished video frame-by-frame from the captured data — no screen recording needed. Core philosophy: **scout once, render many** + **pluggable providers** (free ↔ premium) + **frame-by-frame rendering** (Remotion animates everything from screenshots).

## The Pipeline (read this first)

**Scout → Screenshots + JSONL → Remotion ScoutReplay → Video**

There is no screen recording step. Remotion renders every frame from static screenshots + interaction data:

1. **Scout** — Claude explores the app via Chrome DevTools MCP. The PostToolUse hook (`lib/log-devtools-action.mjs`) logs every action to `walkthrough.jsonl` with **element bounds, accessibility labels, scroll positions**. Screenshots are saved at each visual state change.
2. **Render** — `node cli.mjs scout-to-video` generates narration → TTS audio → Whisper word timings → Remotion renders `ScoutReplay.tsx` frame-by-frame. Between each pair of screenshots, Remotion animates: smooth cursor movement along bezier paths to real element bounds, spring-based zoom into click targets, crossfade/transition between before→after states, click pulse effects, typing overlays, word-highlight captions, lower thirds, and intro/outro cards.

**This works because Remotion renders React components frame-by-frame into video.** With 150 frames between two screenshots, you get smooth cursor animation, zoom easing, and transition effects that look better than a screen recording — and they're fully deterministic and re-renderable with different styles.

**The scout data quality is everything.** The hook MUST capture real element bounds from the accessibility tree. Without bounds, the cursor has no target, the zoom has no focus point, and it degrades to a basic crossfade slideshow. The PostToolUse hook uses the new format: `{"matcher": "regex", "hooks": [{"type": "command", "command": "..."}]}`. The old flat format (`{"matcher": "...", "command": "..."}`) is deprecated and will cause a settings error.

### Slash Commands
- `/scout` — Scout a web app with Chrome DevTools MCP. Captures screenshots + interaction data to `test-scout/`. Verifies the hook is active.
- `/demo` — Full automated pipeline: plan from knowledge base → scout → render

### Legacy: agent-browser recording path
The `full` command and `lib/run.mjs` use agent-browser (Mux's headless browser CLI) for real-time screen recording with a fake SVG cursor. This was the original approach before the frame-by-frame ScoutReplay path. It still works (`npm run full <manifest>`) but requires hand-written scene modules (e.g. `examples/pos-demo/scenes/full-demo.mjs`) and is harder to automate. The ScoutReplay path is preferred because it needs zero scripting — just scout and render.

## Commands

### Root project (ESM, Node.js)
```bash
npm run full <walkthrough.jsonl>     # Full pipeline: JSONL → TTS → render
npm run full:draft <walkthrough>     # Draft preset (free TTS, no avatar, skip verify)
npm run full:production <walkthrough># Production preset (ElevenLabs, avatar, verify)
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

### Slash Commands
- `/demo` — Full automated pipeline: plan → scout → render (ScoutReplay path, no screen recording)
- `/scout` — Scout a web app via Chrome DevTools MCP, capturing screenshots + interaction data to `test-scout/`

### Remotion project (`demo-render/`)
```bash
cd demo-render
npx remotion studio                  # Live preview with hot reload
npx remotion render src/index.ts MarketingDemo  # Render marketing demo
npx remotion render src/index.ts ScoutReplay    # Render scout replay
```

No test runner or linter is configured.

## Architecture

### Legacy Recording Engine (lib/run.mjs + lib/ab.js)

The legacy recording engine uses **agent-browser** (Mux's headless browser CLI), not Playwright directly. `lib/ab.js` wraps agent-browser commands. The recording flow:

1. Generate TTS audio for all narration segments (in parallel)
2. Budget preflight: compare estimated action cost (cursorClick: 1200ms, type: 200ms/char, etc.) vs narration duration. If actions overflow, splice silence padding into the audio.
3. Open headed Chromium via agent-browser, inject fake SVG cursor (`lib/cursor.js`)
4. Screen record while executing the scene module timed to narration segments
5. Stop recording, merge raw .webm + narration audio via ffmpeg

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
| `scripts/marketing-pipeline.mjs` | **Marketing pipeline**: 10-step flow (video → Whisper → Rhubarb → markers → render → optimize) |
| `scripts/stitch.mjs` | **Video stitcher**: combine multiple videos with transition cards via concat demuxer |
| `lib/whisper.mjs` | Whisper.cpp transcription with BPE-aware word-level timestamps (DTW alignment) |
| `lib/log-devtools-action.mjs` | PostToolUse hook — appends structured JSONL during Scout phase |
| `lib/run.mjs` | Legacy recording engine (TTS → budget → agent-browser record → stitch) |
| `lib/ab.js` | Agent-browser command wrapper (sends commands to headed Chromium) |
| `lib/cursor.js` | Fake SVG cursor injection + click pulse animation |
| `lib/budget.js` | Timeline budget calculator (action costs vs. narration duration) |
| `lib/render.js` | FFmpeg operations (merge audio/video, burn captions, concat scenes) |
| `scripts/jsonl-to-manifest.mjs` | Walkthrough JSONL → recording manifest |
| `scripts/jsonl-to-remotion-props.mjs` | Walkthrough JSONL → Remotion scene graph props |
| `scripts/jsonl-to-scout-props.mjs` | Walkthrough JSONL → ScoutReplay props |
| `scripts/generate-narration.mjs` | AI narration generation from walkthrough data |
| `demo-render/pipeline.mjs` | Post-production orchestration (Whisper → props → render → verify) |
| `demo-render/src/ScoutReplay.tsx` | **Primary composition**: frame-by-frame rendering from screenshots + JSONL |
| `demo-render/src/MarketingDemo.tsx` | **Marketing composition**: presenter + lip sync + intro/outro + captions |
| `demo-render/src/Demo.tsx` | **Legacy composition**: screen recording-based |
| `scripts/pitch-video-pipeline.mjs` | **Pitch video pipeline**: markdown script → images (OpenAI) → TTS → Whisper sync → timeline audit → Remotion render |
| `scripts/generate-timeline-audit.mjs` | **Timeline audit**: machine-readable scene/audio alignment check — run before renders to catch misalignments |
| `scripts/generate-pitch-images.js` | **Image generation**: batch OpenAI GPT Image 1.5 scene image generation |
| `scripts/assemble-pitch-v2.mjs` | Manual assembly script for fine-tuned scene-to-image mapping |
| `mcp-server/index.js` | MCP server exposing `create_narrated_recording` tool |

### Remotion Compositions

**ScoutReplay.tsx** (primary) — Frame-by-frame rendering from screenshot data + JSONL. Renders ScreenshotScene + AnimatedCursor + TypingAnimation per action. Between each screenshot pair, Remotion has ~150 frames to animate: smooth cursor bezier paths to real element bounds, spring-based zoom into click targets, crossfade transitions, click pulse effects, typing overlays, lower thirds.

**MarketingDemo.tsx** — Polished product demos: IntroCard (with Sora cinematic clip) → light leak transition → main content (screen recording + Presenter avatar with Rhubarb lip sync + WordHighlightCaptions + LowerThirds + ProgressBar + music bed) → fade → OutroCard. Used by `scripts/marketing-pipeline.mjs`.

**Demo.tsx** (legacy) — Screen recording-based: IntroCard → TransitionClip → ZoomableVideo (with WordHighlightCaptions, LowerThirds, AvatarPip) → OutroCard. Requires agent-browser recording + hand-written scene modules.

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

- `~/Movies/agent-recordings/` — Session recordings (raw footage, audio, walkthrough data)
- `./final-output/` — Rendered video output
- `./pitch-output/` — Pitch pipeline working directory (images, audio, props, audit)
- `./demo-render/public/` — Assets staged for Remotion (screen.mp4, avatar.mp4, word-timings.json)

## Codebase Conventions

- ESM throughout (`"type": "module"` in both package.json files)
- No bundler — raw Node.js with `.mjs` extensions for scripts, `.js` for library modules
- Remotion project uses TypeScript (`.tsx`/`.ts`) in `demo-render/src/`
- Provider pattern: router module (`index.js`) dispatches to provider modules that export a common interface
- Agent-browser is the recording tool (not Playwright). `lib/ab.js` wraps it.
- Props are always derived programmatically from walkthrough data — no manual prop editing needed

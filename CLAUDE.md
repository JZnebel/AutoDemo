# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoDemo films verified, narrated walkthroughs of web apps. Claude writes a short **flow** per
clip (what to click, paced to narration lines); the **core** (`core/`) synthesises the
narration, resets the app, records the flow in Chrome paced to the voice, checks every step and
what was on screen (untranslated text, labels the narration names), cuts dead time, zooms, and
renders captioned clips with Remotion (`TrainingClip`) — then ships them to a help site. Each
app is a **project**: `examples/brotherpos` (127 clips, English + French, seeded store) and
`examples/rezweed` (hosted DB with cleanup scripts, phone shots).

Older pipelines live alongside it: the `/demo` screencast pipeline (Claude explores a URL live
through the Chrome DevTools MCP fork, narration-driven speed editing, MarketingDemo), plus
marketing, pitch and stitch pipelines.

## Walkthrough clips — the core (read this first)

```bash
node core/cli.mjs make    <project> <clip ...|--all> [--lang en,fr] [--jobs N] [--queue] [--max-minutes M] [--no-publish]
node core/cli.mjs status  <project>                      # the --queue: done / failed / left
node core/cli.mjs tts     <project> <clip> <lang>
node core/cli.mjs record  <project> <clip> <lang> [--dry]
node core/cli.mjs check   <project> <clip> <lang>        # screen checks on a recorded take
node core/cli.mjs finish  <project> <clip> <lang> [--accept-screen] [--no-cut] [--no-zoom]
node core/cli.mjs ship    <project> [clip ...] [--no-deploy] [--commit]
```

`<project>` is a folder with `autodemo.config.mjs` or a name under `examples/`.

| File | Role |
|---|---|
| `core/project.mjs` | Loads a project; **documents every config key** (reset, ready, workers, labels, allowedText, guards, docs, render, chrome, beforeAll/afterAll, shutdown); `loadTake()` reads a recorded take (shots, marks, screen log) |
| `core/recorder.mjs` | `ctx` for flows: `line(id)` voice pacing, `click/type/pointAt/...` that wait for their target (re-found via `refinders` if replaced) and then `quiet()` for what the action started; `expect()` for result checks; logs actions, server waits and visible text each second |
| `core/run-flow.mjs` | Records one clip × language (all its shots); config `guards` discard a take; writes `raw/<clip>.<lang>.{mp4,marks.json,screen.json}` |
| `core/checks.mjs` | Screen checks: untranslated text (config.labels + English heuristic), worker marker leak, narration-named labels missing, held spinners, covered clicks |
| `core/edit.mjs` | Dead-time cuts (server waits/frozen spans with no speech, never around clicks) and zooms per line |
| `core/finish.mjs` | Line checks → screen checks → cuts/zooms per shot → narration mix → TrainingClip render → loudnorm → web copy + poster → render review; `.rejected.mp4` on failure |
| `core/make.mjs` | Queue (`.local/queue.json`), retakes, `--jobs` workers, background renders, config.reset before each take |
| `core/publish.mjs`, `core/ship.mjs` | Docusaurus help site: videos + manifest, `<TrainingVideo>` player on each page, build, rsync swap |
| `core/tts.py` | edge-tts per line, with the synthesiser's own word timings (no Whisper) |
| `lib/quality-checks.mjs` | Shared: loudness mastering, render review, transcript/narration/speed checks |
| `demo-render/src/TrainingClip.tsx` | The walkthrough composition: shots (full-frame or phone handset), zooms, captions in a band or overlaid |

Flows import helpers as `autodemo/recorder` (package self-reference via `exports`).
A clip in `narration.json` is `{ id, flow | shots, frame, title, lines: [{ id, en, fr }] }`;
`shots: [{ flow, frame: "phone" }]` plays several recordings in order.

Each example's README has its app-specific gotchas — read it before filming that app.

## The /demo screencast pipeline

**Screencast Record → Claude writes narration.json → Pipeline renders MarketingDemo → Video**

Quick, unverified demo videos of any URL. It uses a Chrome DevTools MCP fork with built-in screencast recording, SVG cursor animation, and auto-segmentation.

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

## Commands

### Screencast Pipeline (/demo)
```bash
node cli.mjs screencast <recording.mp4> [timeline.jsonl]          # Full screencast pipeline
node scripts/screencast-pipeline.mjs <recording> [timeline] \
  --preset draft --skip-narration --name <name>                    # With options
node scripts/screencast-audit.mjs screencast-output/               # Check narration/video alignment
```
9-step pipeline: read narration.json → narration-driven video edit → TTS → Whisper word timings → assemble MarketingDemo props → Remotion render → h265 optimize → output to `screencast-output/`.

### Older pipelines (`node cli.mjs help`)
```bash
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
| `core/cli.mjs` | **Walkthrough clips** — see the core section above |
| `cli.mjs` | Older pipelines' dispatcher (screencast, render, marketing, stitch, avatar, lambda) |
| `scripts/screencast-pipeline.mjs` | **Screencast pipeline**: 9-step flow (narration.json → video edit → TTS → Whisper → render → optimize) |
| `scripts/screencast-audit.mjs` | **Screencast audit**: check narration/video alignment before render |
| `lib/video-editor.mjs` | **Narration-driven video editing**: `buildNarrationDrivenEditList` maps narration segments to footage slices with speed adjustment |
| `.mcp.json` | MCP server config — points to Chrome DevTools MCP fork with `--human-mode --experimental-screencast --isolated` |
| `scripts/marketing-pipeline.mjs` | **Marketing pipeline**: 10-step flow (video → Whisper → Rhubarb → markers → render → optimize) |
| `scripts/stitch.mjs` | **Video stitcher**: combine multiple videos with transition cards via concat demuxer |
| `lib/whisper.mjs` | Whisper.cpp transcription with BPE-aware word-level timestamps (DTW alignment) |
| `demo-render/pipeline.mjs` | Post-production orchestration (Whisper → props → render → verify) |
| `demo-render/src/MarketingDemo.tsx` | **/demo and marketing composition**: screencast footage + intro/outro + captions + narration |
| `scripts/pitch-video-pipeline.mjs` | **Pitch video pipeline**: markdown script → images (OpenAI) → TTS → Whisper sync → timeline audit → Remotion render |
| `scripts/generate-timeline-audit.mjs` | **Timeline audit**: machine-readable scene/audio alignment check — run before renders to catch misalignments |
| `scripts/generate-pitch-images.js` | **Image generation**: batch OpenAI GPT Image 1.5 scene image generation |
| `scripts/assemble-pitch-v2.mjs` | Manual assembly script for fine-tuned scene-to-image mapping |

### Remotion Compositions

**MarketingDemo.tsx** — Used by both the screencast pipeline and the marketing pipeline. IntroCard (accepts `introTagline`, `introSubtitle`, `accentColor`) → light leak transition → main content (narration-edited screen recording + WordHighlightCaptions + LowerThirds + ProgressBar + optional Presenter avatar with Rhubarb lip sync + music bed) → fade → OutroCard (accepts `outroHeading`, `outroUrl`, `outroCtaText`, `accentColor`). Used by `scripts/screencast-pipeline.mjs` and `scripts/marketing-pipeline.mjs`.

**TrainingClip.tsx** (walkthrough clips, `core/finish.mjs`) — shots in sequence (full-frame with zooms, or a phone recording in a handset), captions in a band under the picture or overlaid, narration audio. No intro/outro: these play on a help page.

**ScoutReplay.tsx, Demo.tsx** — compositions of removed pipelines (the scout converters and the agent-browser engine); still registered in `Root.tsx`, not used.

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
- Walkthrough clips record with puppeteer-core's `page.screencast()` (core/recorder.mjs); the /demo pipeline records through the Chrome DevTools MCP fork (`.mcp.json`).
- Narration is written by Claude by hand in `narration.json` — not auto-generated
- Props are derived programmatically from narration.json + walkthrough data

# Agent Video

Automated narrated demo video pipeline. An AI agent scouts a web app via Chrome DevTools, capturing screenshots and interaction data. Remotion renders polished marketing videos frame-by-frame from the captured data — no screen recording needed.

**Scout once, render many.** Change the narration, style, or timing and re-render without touching the browser again.

## Example Output

A POS system demo — register walkthrough + admin dashboard, stitched together with an animated transition card. Includes lip-synced presenter, word-highlight captions, lower thirds, intro/outro cards, and music bed. Everything generated from screen recordings + a markers JSON file.

https://github.com/JZnebel/AutoDemo/raw/main/examples/videos/full-demo-combined.mp4

<details>
<summary>Register demo (30s preview)</summary>

https://github.com/JZnebel/AutoDemo/raw/main/examples/videos/register-preview.mp4

</details>

<details>
<summary>Admin dashboard demo (30s preview)</summary>

https://github.com/JZnebel/AutoDemo/raw/main/examples/videos/admin-preview.mp4

</details>

> Full videos and preview clips are in [`examples/videos/`](examples/videos/).

## How It Works

### 1. Scout

Claude explores your app via Chrome DevTools MCP. A PostToolUse hook logs every action (clicks, navigation, typing) to a JSONL walkthrough file with element bounds, accessibility labels, scroll positions, and viewport data. Screenshots are captured at each visual state change.

```
/scout → test-scout/walkthrough.jsonl + test-scout/screenshots/*.png
```

### 2. Render

The pipeline generates narration, converts to speech, transcribes with Whisper for word-level timing, and renders with Remotion. Between each pair of screenshots, Remotion animates smooth cursor movement, spring-based zoom into click targets, crossfade transitions, click pulse effects, typing overlays, word-highlight captions, and lower thirds.

```
node cli.mjs full test-scout/walkthrough.jsonl
```

### 3. Marketing Pipeline

For polished product demos with a presenter, lip-synced avatar, intro/outro cards, and segment markers:

```bash
node scripts/marketing-pipeline.mjs ~/Movies/agent-recordings/my-recording \
  --markers examples/pos-demo/register-markers.json \
  --name my-product-demo
```

### 4. Pitch Video Pipeline

Create narrated pitch/explainer videos from a markdown script. Supports a mix of AI-generated images (OpenAI GPT Image 1.5), real app screenshots (scouted via Chrome DevTools), and custom images. Scene transitions are synced to actual audio using Whisper word-level timestamps — not estimated.

```bash
# Full pipeline: parse script → generate images → TTS → Whisper → render
node scripts/pitch-video-pipeline.mjs scripts/my-pitch.md

# Skip image generation (reuse existing)
node scripts/pitch-video-pipeline.mjs scripts/my-pitch.md --skip-images

# Draft mode (free Edge TTS, smaller Whisper model)
node scripts/pitch-video-pipeline.mjs scripts/my-pitch.md --draft
```

**Timeline Audit** — Before every render, the pipeline generates a machine-readable timeline mapping every scene transition to the exact narration words, catching misalignments before wasting render time. Can also run standalone:

```bash
node scripts/generate-timeline-audit.mjs pitch-output/pitch-props.json
```

### 5. Image Generation

Generate cinematic images via OpenAI GPT Image 1.5 for pitch videos:

```bash
# Edit prompts in the script, then run
node scripts/generate-pitch-images.js
```

Requires `OPENAI_API_KEY` in `.env`. Supports `gpt-image-1.5` with configurable size/quality.

### 6. Stitch

Combine multiple rendered videos with animated transition cards:

```bash
node scripts/stitch.mjs \
  --parts final-output/part1.mp4 final-output/part2.mp4 \
  --output final-output/combined.mp4 \
  --transition-heading "Next Section" \
  --transition-subtitle "A deeper look"
```

## Quick Start

### Prerequisites

- Node.js 18+
- ffmpeg (for audio/video processing)
- [Claude Code](https://claude.ai/code) (for the `/scout` and `/demo` slash commands)

### Install

```bash
git clone https://github.com/JZnebel/AutoDemo.git
cd AutoDemo
npm install
cd demo-render && npm install && cd ..
```

### Configure

```bash
cp .env.example .env
# Edit .env with your API keys (all optional for draft mode)
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `ELEVENLABS_API_KEY` | Production only | Premium TTS voices |
| `OPENAI_API_KEY` | For image generation | GPT Image 1.5 scene images for pitch videos |
| `ANTHROPIC_API_KEY` | For AI narration | Auto-generates narration from page content |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Optional | Video hosting and sharing |

### Run

```bash
# Scout a web app (requires Chrome DevTools MCP in Claude Code)
/scout

# Full pipeline: scout data → narrated video
npm run full test-scout/walkthrough.jsonl

# Draft mode (free TTS, no avatar, fast)
npm run full:draft test-scout/walkthrough.jsonl

# Preview in Remotion Studio
npm run preview
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run full <walkthrough>` | Full pipeline: JSONL → TTS → render |
| `npm run full:draft <walkthrough>` | Draft preset (free TTS, no avatar) |
| `npm run full:production <walkthrough>` | Production preset (ElevenLabs, avatar) |
| `npm run convert <jsonl>` | Convert JSONL walkthrough to manifest |
| `npm run tts <manifest>` | Generate TTS audio |
| `npm run render <dir>` | Remotion post-production only |
| `npm run render:all <dir>` | Multi-format (landscape + vertical + square) |
| `npm run marketing` | Marketing pipeline with presenter + lip sync |
| `npm run stitch` | Combine multiple videos with transitions |
| `npm run preview` | Start Remotion Studio |
| `npm run providers` | List available TTS/avatar providers |
| `node scripts/pitch-video-pipeline.mjs <script.md>` | Pitch video: markdown → images → TTS → render |
| `node scripts/generate-pitch-images.js` | Generate scene images via OpenAI GPT Image 1.5 |
| `node scripts/generate-timeline-audit.mjs <props.json>` | Audit scene/audio alignment before render |

## Architecture

```
Two paths — scout-based (app demos) and script-based (pitch videos):

Scout Path:                           Pitch Path:
scout (Chrome DevTools MCP)           markdown script + image prompts
  ↓ walkthrough.jsonl + screenshots     ↓ parse scenes
convert (jsonl-to-remotion-props)     generate images (OpenAI GPT Image 1.5)
  ↓ remotion props                      ↓ scene images
         ↓                                    ↓
         └──────────── merge ─────────────────┘
                         ↓
              tts (edge | elevenlabs | kokoro)
                         ↓ narration audio
              whisper.cpp (word-level timing)
                         ↓ word timings JSON
              timeline audit (verify sync)
                         ↓ issues or ✓
              remotion render (ScoutReplay.tsx)
                         ↓ rendered MP4
              ffmpeg optimize (h265/h264)
                         ↓ final-output/*.mp4
```

### Provider System

All external services are swappable via CLI flags or env vars.

| Category | Providers |
|----------|-----------|
| TTS | `elevenlabs` (premium) · `edge` (free, 100+ voices) · `kokoro` (local, offline) |
| Avatar | `sadtalker` (local GPU) · `liveportrait` · `echomimic` · `none` |
| Transcription | whisper.cpp via `@remotion/install-whisper-cpp` |
| Rendering | Local Remotion · AWS Lambda |

### Key Directories

| Path | Purpose |
|------|---------|
| `lib/` | Core modules (TTS, avatar, whisper, recording engine) |
| `scripts/` | Pipeline scripts (marketing, stitch, pitch video, image gen, timeline audit) |
| `demo-render/` | Remotion project (compositions, components, rendering) |
| `demo-render/src/` | ScoutReplay.tsx (primary), MarketingDemo.tsx, Demo.tsx (legacy) |
| `examples/` | Example manifests and segment markers |
| `mcp-server/` | MCP server for `create_narrated_recording` tool |

### Remotion Compositions

- **ScoutReplay** — Frame-by-frame rendering from screenshot data + JSONL. Animates cursor, zoom, crossfade, typing, captions between screenshots.
- **MarketingDemo** — Polished product demos with presenter avatar, lip-synced mouth animation, intro/outro cards, lower thirds, word-highlight captions, and music bed.
- **Demo** (legacy) — Screen recording-based rendering with ZoomableVideo.

## Config Presets

| Preset | TTS | Avatar | Whisper | Verify |
|--------|-----|--------|---------|--------|
| `draft` | edge (free) | none | small | skip |
| `production` | elevenlabs | sadtalker | medium | 35-point |
| `offline` | kokoro (local) | none | local | skip |

## Slash Commands

When using Claude Code in this repo:

- `/scout` — Scout a web app via Chrome DevTools MCP, capturing screenshots + interaction data
- `/demo` — Full automated pipeline: plan from knowledge base, scout, render

## License

MIT

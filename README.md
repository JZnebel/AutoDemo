# AutoDemo

Automated narrated demo videos. Record a web app via Chrome DevTools, Claude writes the narration, and the pipeline renders a polished video with Remotion — cursor animations, speed ramps, captions, intro/outro cards, and TTS voiceover.

**Record once, narrate and render many.** Re-narrate the same footage with a different script and get a completely different edit.

## How It Works

### 1. Record

A Chrome DevTools MCP fork runs alongside Claude Code with `--human-mode`. It records the screen via CDP while Claude interacts with your app — clicking, typing, navigating. The fork adds:

- **SVG cursor animation** on every click and form fill (realistic mouse movement)
- **Auto-segmentation** — pauses recording after 15s of idle, resumes when the next action fires (long waits like AI generation get cut automatically)
- **Timeline JSONL** — timestamps every tool call for post-production editing

```
screencast_start → interact with app → screencast_stop → recording.mp4 + timeline.jsonl
```

### 2. Narrate

Claude writes `narration.json` based on what happened during recording. Each segment maps to a specific time range in the footage:

```json
{
  "introTagline": "Build a Website in 60 Seconds",
  "outroUrl": "trafficstores.ca",
  "segments": [
    {
      "text": "Starting at Traffic Stores, we click Create Your Store.",
      "sceneLabel": "Sign Up",
      "videoStartSec": 3.7,
      "videoEndSec": 9.4
    }
  ]
}
```

### 3. Render

The pipeline stretches or compresses each video segment to match its narration audio duration. A 15-second signup sequence narrated in 5 seconds plays at 3x. A 2-second click narrated in 4 seconds plays at 0.5x slow motion.

```bash
node scripts/screencast-pipeline.mjs recording.mp4 timeline.jsonl --skip-narration --preset draft
```

Output: polished MP4 with intro card, narrated footage with word-highlight captions, lower thirds, and outro card.

## Quick Start

### Prerequisites

- Node.js 20+
- ffmpeg (`sudo apt install ffmpeg` or [ffmpeg.org](https://ffmpeg.org/))
- [Claude Code](https://claude.ai/code)

### Install

```bash
git clone --recursive https://github.com/JZnebel/AutoDemo.git
cd AutoDemo
npm install
cd demo-render && npm install && cd ..

# Build the Chrome DevTools MCP fork
bash scripts/setup-devtools-mcp.sh
```

### Configure

```bash
cp .env.example .env
# Edit .env with your API keys (all optional for draft mode)
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `ELEVENLABS_API_KEY` | Production only | Premium TTS voices |
| `OPENAI_API_KEY` | For image generation | Scene images for pitch videos |
| `ANTHROPIC_API_KEY` | For AI narration | Auto-generate narration (optional — Claude can write it in conversation) |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Optional | Video hosting |

### Record a Demo

Open Claude Code in the AutoDemo directory. The MCP fork connects automatically.

```
> Record a demo of trafficstores.ca — sign up, go through the wizard, show the generated website
```

Claude will:
1. Open the page, start screencast recording
2. Interact with the app (clicks, fills, navigations) with animated cursor
3. Auto-pause during long waits (AI generation, etc.)
4. Auto-resume when results appear
5. Stop recording → `final-output/recording.mp4` + `final-output/recording.jsonl`

### Produce the Video

Claude writes narration based on the recording, then runs the pipeline:

```bash
# Generate TTS from narration
edge-tts --voice "en-US-GuyNeural" --text "$(cat screencast-output/narration.json | python3 -c 'import sys,json; print(json.load(sys.stdin)["fullText"])')" --write-media screencast-output/narration.mp3

# Run pipeline (uses existing narration + TTS)
node scripts/screencast-pipeline.mjs final-output/recording.mp4 final-output/recording.jsonl \
  --preset draft --skip-narration --name my-demo

# Check narration/video alignment
node scripts/screencast-audit.mjs screencast-output/
```

Output: `final-output/my-demo-final.mp4`

## Commands

| Command | Description |
|---------|-------------|
| `node cli.mjs screencast <recording> [timeline]` | Screencast pipeline (primary) |
| `node scripts/screencast-pipeline.mjs <recording> [timeline]` | Direct pipeline invocation |
| `node scripts/screencast-audit.mjs <output-dir>` | Check narration/video alignment |
| `npm run preview` | Start Remotion Studio for live preview |
| `npm run providers` | List available TTS/avatar providers |
| `node scripts/pitch-video-pipeline.mjs <script.md>` | Pitch video from markdown script |
| `node scripts/marketing-pipeline.mjs <recording-dir>` | Marketing pipeline with presenter |
| `node scripts/stitch.mjs --parts a.mp4 b.mp4` | Combine videos with transition cards |

## Architecture

```
Record (Chrome DevTools MCP fork)
  ↓ recording.mp4 + timeline.jsonl
Claude writes narration.json
  ↓ segments with videoStartSec/videoEndSec
TTS (edge | elevenlabs | kokoro)
  ↓ narration.mp3
Whisper (word-level timestamps)
  ↓ word-timings.json
Narration-driven video editor
  ↓ each video clip stretched/compressed to match narration
Remotion render (MarketingDemo composition)
  ↓ intro + narrated footage + captions + outro
  ↓ final-output/*.mp4
```

### Chrome DevTools MCP Fork

The recording engine lives in `chrome-devtools-mcp/` (git submodule → [JZnebel/humanchromedevtools](https://github.com/JZnebel/humanchromedevtools)). Key features:

| Feature | Flag | What it does |
|---------|------|-------------|
| Human mode | `--human-mode` | Blocks URL navigation, forces click-based interaction, adds SVG cursor |
| Screencast | `--experimental-screencast` | CDP video recording with segment management |
| Isolated | `--isolated` | Fresh Chrome profile per session (no conflicts with your browser) |

Configured in `.mcp.json` — Claude Code picks it up automatically when opened in the AutoDemo directory.

### Provider System

All external services are swappable via CLI flags or env vars.

| Category | Providers |
|----------|-----------|
| TTS | `elevenlabs` (premium) · `edge` (free, 100+ voices) · `kokoro` (local, offline) |
| Avatar | `sadtalker` (local GPU) · `liveportrait` · `none` |
| Transcription | whisper.cpp via `@remotion/install-whisper-cpp` |
| Rendering | Local Remotion · AWS Lambda |

### Remotion Compositions

- **MarketingDemo** (primary) — Screen recording in device mockup with word-highlight captions, lower thirds, progress bar, intro/outro cards. Props-driven: custom tagline, URL, accent color.
- **ScoutReplay** (secondary) — Frame-by-frame rendering from screenshots + JSONL. Not tested end-to-end.
- **Demo** (legacy) — Screen recording-based. Requires agent-browser (not installed).

### Key Directories

| Path | Purpose |
|------|---------|
| `chrome-devtools-mcp/` | MCP fork submodule (recording engine) |
| `lib/` | Core modules (TTS, whisper, video editor) |
| `scripts/` | Pipeline scripts |
| `demo-render/` | Remotion project |
| `screencast-output/` | Pipeline working directory |
| `final-output/` | Rendered videos |

## Other Pipelines

### Pitch Video Pipeline

Create narrated pitch/explainer videos from a markdown script with AI-generated images:

```bash
node scripts/pitch-video-pipeline.mjs scripts/my-pitch.md
node scripts/pitch-video-pipeline.mjs scripts/my-pitch.md --draft  # free TTS
```

### Marketing Pipeline

Polished demos with lip-synced presenter avatar:

```bash
node scripts/marketing-pipeline.mjs ~/Movies/agent-recordings/my-recording \
  --markers examples/pos-demo/register-markers.json
```

### Stitch

Combine multiple videos with animated transition cards:

```bash
node scripts/stitch.mjs \
  --parts final-output/part1.mp4 final-output/part2.mp4 \
  --transition-heading "Next Section"
```

## Config Presets

| Preset | TTS | Whisper | Avatar |
|--------|-----|---------|--------|
| `draft` | edge (free) | base.en | none |
| `production` | elevenlabs | medium.en | sadtalker |
| `offline` | kokoro (local) | base.en | none |

## License

MIT

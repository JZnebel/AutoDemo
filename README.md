# AutoDemo

AI agent records your web app, writes narration, and renders a polished demo video. One command.

```
/demo https://your-app.com
```

Pass login credentials and a brief to demo apps behind auth:

```
/demo https://your-app.com --login admin@test.com:password123 --brief "show the dashboard, create a project, and preview it"
```

Or just describe it naturally:

```
/demo https://app.com — log in as demo@example.com / pass123, show the billing page and team settings
```

Claude Code opens the URL, logs in if needed, explores the features you asked for (or freely if no brief), records a screencast with animated cursor, writes narration timed to the action, and renders a finished video with TTS voiceover, word-highlight captions, intro/outro cards, and speed ramps.

**Narration drives video timing.** Footage stretches or compresses to match narration audio. A 15-second sequence narrated in 5 seconds plays at 3x. A 2-second click narrated in 8 seconds plays in slow motion. Re-narrate the same footage with a different script and get a completely different edit.

## Quick Start

### Prerequisites

- Node.js 20+
- ffmpeg
- [Claude Code](https://claude.ai/code)

### Install

```bash
git clone --recursive https://github.com/JZnebel/AutoDemo.git
cd AutoDemo
npm install
cd demo-render && npm install && cd ..
bash scripts/setup-devtools-mcp.sh
```

### Run

Open Claude Code in the AutoDemo directory. The Chrome DevTools MCP connects automatically.

```
/demo https://your-app.com --login user@example.com:pass --brief "show the main features"
```

Or step by step:

```
> Record a demo of my-app.com — show the dashboard, create a new project, and preview it
```

Claude will record the screencast, write narration, and render the video. Output lands in `final-output/`.

## How It Works

```
/demo https://app.com
  |
  |  Phase 1: Scout
  |  Open URL, understand the app, plan demo segments
  |
  |  Phase 2: Record
  |  screencast_start → interact with app → screencast_stop
  |  SVG cursor animation, auto-segmentation on idle
  |  Output: recording.mp4 + timeline.jsonl
  |
  |  Phase 3: Narrate
  |  Claude writes narration.json from what it just did
  |  Each segment: text + sceneLabel + sceneIndex
  |
  |  Phase 4: Render (autodemo pipeline)
  |  TTS (edge-tts or ElevenLabs)
  |    → WhisperX forced alignment (word-level timestamps)
  |    → Per-segment speed matching
  |    → Video padding to narration duration
  |    → Remotion render (MarketingDemo composition)
  |  Output: final-output/demo.mp4
```

### The Autodemo Pipeline

The render phase is a standalone script that takes a recording + narration and produces a finished video:

```bash
node scripts/autodemo.mjs \
  --narration narration.json \
  --output-dir screencast-output/my-demo \
  --skip-record
```

It handles: TTS generation, WhisperX word alignment, per-segment speed matching (footage compressed/stretched to match narration audio), video padding, and Remotion rendering with intro card, word-highlight captions, progress bar, and outro card.

### Replay Scripts

Record once, replay instantly. The timeline-to-replay converter turns a recording session's JSONL into a deterministic replay script:

```bash
# Convert timeline to replay script
node scripts/timeline-to-replay.mjs timeline.jsonl > replay-script.json

# Re-record with different URL/branding — no AI needed
node scripts/replay-demo.mjs replay-script.json
```

Replay scripts use text-based selectors (`"click the button that says Sign In"`) so they work even if element IDs change. Useful for re-recording the same flow with different branding, URLs, or data.

### Sync Audit

Cross-reference action timestamps with narration word timing to catch misalignment before publishing:

```bash
node scripts/sync-audit.mjs screencast-output/my-demo/
```

## Commands

| Command | Description |
|---------|-------------|
| `/demo <url>` | Full pipeline: scout → record → narrate → render |
| `node scripts/autodemo.mjs` | Standalone render pipeline |
| `node scripts/replay-demo.mjs <script>` | Replay a recorded action script |
| `node scripts/timeline-to-replay.mjs <jsonl>` | Convert timeline to replay script |
| `node scripts/sync-audit.mjs <dir>` | Check narration/action alignment |
| `node scripts/screencast-pipeline.mjs <recording>` | Original screencast pipeline |
| `node scripts/screencast-audit.mjs <dir>` | Check narration/video alignment |
| `npm run preview` | Remotion Studio live preview |

## narration.json

```json
{
  "introTagline": "One Platform. Every Business.",
  "introSubtitle": "BrotherPOS Multi-Vertical Platform",
  "outroHeading": "Ready to get started?",
  "outroUrl": "brotherpos.com",
  "outroCtaText": "Try Free",
  "accentColor": "rgba(16, 185, 129, 1)",
  "segments": [
    {
      "text": "This is what a clothing store sees. A clean product grid with categories.",
      "sceneIndex": 0,
      "sceneLabel": "Clothing Store"
    },
    {
      "text": "Now the restaurant logs in. Same app, completely different experience.",
      "sceneIndex": 1,
      "sceneLabel": "Restaurant Mode"
    }
  ],
  "fullText": "All segments joined..."
}
```

Each segment's narration audio duration determines how fast its video plays. More words = slower footage. Fewer words = faster footage.

## Architecture

### Chrome DevTools MCP Fork

The recording engine is a fork of Chrome DevTools MCP ([JZnebel/humanchromedevtools](https://github.com/JZnebel/humanchromedevtools)) with:

- **Human mode** — blocks URL navigation, forces click-based interaction for realistic recordings
- **SVG cursor animation** — animated cursor on every click and form fill
- **Auto-segmentation** — pauses recording after 15s idle, resumes on next action (cuts dead time automatically)
- **Timeline JSONL** — logs every action with element text, tag, role, and label for replay scripts
- **Screencast recording** — CDP-based video capture with segment concatenation

Configured in `.mcp.json` — Claude Code connects automatically.

### Provider System

All external services are swappable via flags or env vars:

| Category | Providers |
|----------|-----------|
| TTS | `edge` (free, 100+ voices) · `elevenlabs` (premium) · `kokoro` (local) |
| Word timing | WhisperX forced alignment (wav2vec2) · whisper.cpp · VTT fallback |
| Rendering | Local Remotion · AWS Lambda |

### Remotion Compositions

- **MarketingDemo** (primary) — Device mockup, word-highlight captions, lower thirds, progress bar, intro/outro cards with configurable tagline, URL, accent color, and optional background video.
- **ScoutReplay** (secondary) — Frame-by-frame from screenshots + JSONL.

### Key Directories

| Path | Purpose |
|------|---------|
| `chrome-devtools-mcp/` | MCP fork submodule (recording engine) |
| `.claude/skills/demo/` | `/demo` slash command skill |
| `scripts/` | Pipeline scripts (autodemo, replay, sync audit) |
| `lib/` | Core modules (TTS, whisper, video editor) |
| `demo-render/` | Remotion project (TypeScript compositions) |
| `screencast-output/` | Pipeline working directory (gitignored) |
| `final-output/` | Rendered videos (gitignored) |

## Config

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `ELEVENLABS_API_KEY` | Production only | Premium TTS voices |
| `OPENAI_API_KEY` | Pitch videos only | AI-generated scene images |
| `ANTHROPIC_API_KEY` | Optional | Auto-generate narration via API |

Draft mode (default) uses free edge-tts and requires no API keys.

## Presets

| Preset | TTS | Word Timing | Quality |
|--------|-----|-------------|---------|
| `draft` | edge (free) | WhisperX or whisper base | Fast, no API keys |
| `production` | ElevenLabs | WhisperX large-v3 | Best quality |
| `offline` | kokoro (local) | whisper base | Zero network calls |

## License

MIT

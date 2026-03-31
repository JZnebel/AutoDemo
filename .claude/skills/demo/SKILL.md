---
name: demo
description: Record a narrated demo video of a web app. Opens the URL, explores it while screencast recording, writes narration, and renders a polished video.
disable-model-invocation: true
argument-hint: <url> [--login <email:password>] [--brief <"what to show">] [--name <name>] [--duration <seconds>]
allowed-tools: Bash, Read, Write, Glob, Grep, Agent, mcp__chrome-devtools__new_page, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__click, mcp__chrome-devtools__fill, mcp__chrome-devtools__type_text, mcp__chrome-devtools__press_key, mcp__chrome-devtools__hover, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__screencast_start, mcp__chrome-devtools__screencast_stop, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__resize_page
---

# /demo — Automated Demo Video Pipeline

You are creating a narrated demo video of a web application. The entire flow — exploration, recording, narration, and rendering — happens in this single command.

## Arguments

Parse from `$ARGUMENTS`:
- First positional arg: **URL** to demo (required)
- `--login <credentials>`: Login credentials in `email:password` format. If provided, log in before recording.
- `--brief <"what to show">`: Natural language description of what the demo should cover. Can be very short — "show the dashboard and create a project" is enough. If omitted, explore freely.
- `--name <name>`: Output name (default: derived from URL hostname)
- `--duration <seconds>`: Target video duration (default: 60)
- `--voice <voice>`: TTS voice (default: `en-US-GuyNeural`)
- `--preset <draft|production>`: Quality preset (default: `draft`)

Arguments can also be passed as natural language after the URL. All of these are equivalent:
```
/demo https://app.com --login admin@test.com:pass123 --brief "show the billing page and add a payment method"
/demo https://app.com — log in as admin@test.com / pass123, show billing and add a payment method
/demo https://app.com login: admin@test.com pass123. Show the billing page.
```
Parse what you can. If the user gives you credentials and instructions in plain English, use them.

## Pipeline

### Phase 1: Scout the app

Before recording, understand what you're working with:

1. Open the URL via `new_page` or `navigate_page`
2. **If credentials provided** (`--login`), find the login form and sign in first. Look for common patterns: `/login`, `/sign-in`, a "Sign In" link, etc. Use `fill` for email/password fields, then click submit. Wait for the dashboard/home page to load before continuing.
3. Take a screenshot and snapshot to understand the app
4. **Capture the brand**: Identify the app's logo and accent/brand color.
   - Try to download the logo image to the output directory (resolved in Phase 2) as `logo.png` (or .svg/.webp). During scouting, save it to a temp location first, then move it into the final output dir once the unique name is resolved. Use `evaluate_script` to find the logo `<img>` src URL, then use Bash `curl` or `wget` to save it. The pipeline will auto-detect it and use it in the intro card.
   - Pick the accent color from the app's primary button/brand color and use it as `accentColor` in narration.json (rgba format).
5. **If a brief was provided** (`--brief`), use it to guide your exploration. The brief tells you what the user cares about — prioritize those features. If no brief, explore freely.
6. Identify the key features, navigation, and interesting flows
7. Plan 3-6 demo segments that showcase the app in ~`duration` seconds of narration

Think about what makes a compelling demo:
- If there's a brief, follow it — the user knows what they want to show
- Start with the most visually impressive or unique feature
- Show breadth (navigate different sections) not depth (don't get stuck on one form)
- End with something that ties it together (dashboard, settings, results)
- Skip login screens, loading spinners, and error states in the recording — handle those in setup before `screencast_start`

### Phase 2: Record

Set up the output directory and start recording:

```
Output dir: screencast-output/<name>/
Recording: screencast-output/<name>/recording.mp4
```

1. **Pick a unique output directory.** Before creating the directory, check if `screencast-output/<name>/` already exists. If it does, append an incrementing suffix: `<name>-v2`, `<name>-v3`, etc. Use the first available name. For example:
   ```bash
   # Check and find next available name
   NAME="trafficstores"
   DIR="screencast-output/$NAME"
   if [ -d "$DIR" ]; then
     V=2; while [ -d "screencast-output/${NAME}-v${V}" ]; do V=$((V+1)); done
     NAME="${NAME}-v${V}"
     DIR="screencast-output/$NAME"
   fi
   mkdir -p "$DIR"
   ```
   Use the resolved `<name>` (with suffix if needed) for ALL subsequent paths in this run — recording, narration.json, composition, render output, etc.
2. Create the output directory
2. Call `screencast_start` with path `screencast-output/<name>/recording.mp4`
3. **Interact with the app naturally** — click through the features you planned
   - Pause briefly (1-2 seconds) on each important screen so viewers can read it
   - Click buttons, fill forms with realistic data, navigate between sections
   - The MCP fork handles cursor animation and auto-segmentation automatically
4. Call `screencast_stop` when done

**Recording tips:**
- Don't rush — the pipeline will speed up boring parts automatically
- DO pause on visually interesting screens (the pipeline slows these down to match narration)
- Avoid scrolling inside cross-origin iframes — navigate directly instead
- If something takes a long time to load, the auto-segmenter will cut the wait

### Phase 3: Write narration

Write `screencast-output/<name>/narration.json` based on what you just recorded. You know exactly what happened because you did it.

```json
{
  "introTagline": "Short punchy headline",
  "introSubtitle": "Product or company name",
  "outroHeading": "Call to action question",
  "outroUrl": "website.com",
  "outroCtaText": "Get Started",
  "accentColor": "rgba(59, 130, 246, 1)",
  "captionStyle": "pop",
  "voice": "en-US-AndrewNeural",
  "introLogoSrc": "screencast-output/<name>/logo.png",
  "segments": [
    {
      "text": "Narration for this segment. Write conversationally, like a human presenting.",
      "sceneIndex": 0,
      "sceneLabel": "Feature Name"
    }
  ],
  "fullText": "All segment texts joined with spaces."
}
```

**Narration guidelines:**
- Write like you're presenting to someone over their shoulder, not reading documentation
- Use present tense: "Here we see..." not "Here we saw..."
- Call out specific UI elements the viewer should notice
- Keep total narration around the `--duration` target
- Each segment should be 5-20 seconds of speech (~15-50 words)
- The `accentColor` should match the app's brand color (pick from what you saw)
- Each segment's `sceneLabel` becomes an animated lower third in the video — keep them short (2-3 words max): "Sign Up", "AI Builder", "Live Website"
- Set `introLogoSrc` to the logo file you downloaded in Phase 1 — it shows with a spring animation in the intro card
- Set `captionStyle` to match the app's feel: `"pop"` (bouncy, playful), `"clean"` (frosted glass, elegant), `"bold"` (large, punchy), `"minimal"` (subtle), `"karaoke"` (no background), or `"outline"` (glow shadow)
- Choose a `voice` that matches the app's tone:
  - `en-US-AndrewNeural` — Warm, confident (good default)
  - `en-US-BrianNeural` — Approachable, casual (startups, friendly apps)
  - `en-US-ChristopherNeural` — Reliable, authoritative (enterprise, fintech)
  - `en-US-AriaNeural` — Positive, confident (marketing, consumer apps)
  - `en-US-EmmaNeural` — Cheerful, clear (e-commerce, social)
  - `en-US-AvaNeural` — Expressive, caring (health, wellness, community)
  - `en-US-JennyNeural` — Friendly, considerate (education, support)
  - `en-US-EricNeural` — Rational (analytics, data tools)
  - `en-US-GuyNeural` — Passionate (creative tools, media)
  - `en-GB-RyanNeural` / `en-GB-SoniaNeural` — British (international, luxury)

### Phase 3.5: Design Custom Video Composition

Write a custom Remotion composition for this specific video. Save it as `screencast-output/<name>/composition.tsx`. The pipeline will use it instead of the default MarketingDemo template.

**Load the Remotion skills first:** Read the rules from `demo-render/.agents/skills/remotion-best-practices/rules/` — especially `animations.md`, `timing.md`, `text-animations.md`, `transitions.md`, and `sequencing.md`.

**Your composition must:**
1. Export `VideoComposition` (the React component) and `calculateMarketingDemoDuration` (duration function)
2. Export `MarketingDemoProps` type (re-export from `./MarketingDemo`)
3. Accept the same props as MarketingDemo — the pipeline passes the same JSON

**Available building blocks** (import from `./components/`):
- `DeviceMockup` — Screen recording in browser chrome (`videoSrc`, `accentColor`, `displayUrl`, `zoomRegions`, `layout`)
- `IntroCard` / `OutroCard` — Default intro/outro templates (`tagline`, `subtitle`, `accentColor`, `logoSrc`)
- `WordHighlightCaptions` — Word-by-word captions (`wordTimings`, `style`, `accentColor`)
- `LowerThird` — Scene label overlay (`label`, `accentColor`, `leftOffset`)
- `ProgressBar` — Progress indicator (`accentColor`)
- `AudioWaveform` — Audio-reactive visualizer (`variant`, `accentColor`, `samples`)
- `FeatureCallout` — Annotation callout (`label`, `side`, `y`, `accentColor`)
- `ChapterCard` — Scene divider card (`chapterNumber`, `title`, `accentColor`)
- `Presenter` — 2D character with lip sync (`mouthCues`, `side`)
- `AvatarPip` — Avatar picture-in-picture
- `SceneBreak` — Brief visual flash at scene boundaries

You can also write custom components inline in the composition file.

**Design decisions to make per video:**
- **Intro style:** Write a custom intro or use IntroCard. Match the app's personality — earthy/organic, techy/clean, warm/inviting, bold/punchy.
- **Outro style:** Write a custom outro or use OutroCard. Same personality matching.
- **Which overlays to include:** Not every video needs every overlay. Skip AudioWaveform for clean SaaS demos. Skip ProgressBar for short videos. Skip LowerThird if segments are obvious.
- **Overlay positions:** LowerThird doesn't have to be top-left. Captions don't have to be bottom-center. Choose positions that don't overlap with important UI elements in the recording.
- **Animation variety:** Don't always use the same spring-in. Mix fade, slide, wipe, typewriter, stagger. The Remotion skills show the patterns.
- **Transition between intro → content → outro:** Fade, slide, wipe, or light leak. Pick what fits.

**Template literal example** for composition.tsx:
```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
// Import building blocks
import { DeviceMockup } from "./components/DeviceMockup";
import { WordHighlightCaptions } from "./components/WordHighlightCaptions";
import { ProgressBar } from "./components/ProgressBar";
// Import your custom intro/outro (write them inline or as separate components)
// Import types
import type { MarketingDemoProps } from "./MarketingDemo";
export type { MarketingDemoProps };

export function calculateMarketingDemoDuration(props: MarketingDemoProps) {
  return props.introDurationFrames + props.videoDurationFrames + props.outroDurationFrames - 20;
}

// Your custom intro component (inline)
const MyIntro: React.FC<{...}> = (...) => { ... };

export const VideoComposition: React.FC<MarketingDemoProps> = (props) => {
  // Your unique composition layout here
};
```

**Remotion rules to follow:**
- All animations driven by `useCurrentFrame()` — NO CSS transitions/animations
- Use `interpolate()` for keyframes, `spring()` for physics motion
- Use `staticFile()` for assets in `demo-render/public/`
- Use `<Sequence from={frame}>` to delay elements
- Use `<TransitionSeries>` for scene transitions
- Ensure text is readable for at least 1.5 seconds before fading

**Template mode:** For a series of consistent videos (e.g. how-to series), save the composition to a shared template folder and set `"template": "path/to/template-folder"` in narration.json. Every video in the series will use that composition.

### Phase 4: Render

Run the autodemo pipeline to produce the final video:

```bash
node scripts/autodemo.mjs \
  --script /dev/null \
  --narration screencast-output/<name>/narration.json \
  --output final-output/<name>.mp4 \
  --output-dir screencast-output/<name> \
  --skip-record \
  --voice <voice>
```

Note: `--skip-record` tells the pipeline to use existing recordings in the output dir. The pipeline handles:
- TTS generation from narration text
- WhisperX word-level alignment for captions
- Per-segment speed matching (narration drives video timing)
- Video padding when narration is longer than footage
- Remotion render with intro card, captions, progress bar, outro card
- H265 compressed output for email sharing
- Bundle with all assets for re-rendering

### Done

Report to the user:
- Full quality: `final-output/<name>.mp4`
- Compressed: `final-output/<name>-compressed.mp4` (auto-generated by pipeline)
- Duration and file sizes
- Bundle location for re-rendering: `screencast-output/<name>/bundle-*/`

The pipeline prints a summary table with all of this. Just relay it to the user.

## Important Notes

- The screencast recording requires Chrome DevTools MCP to be running. If MCP tools fail, tell the user to ensure Chrome is open and the MCP server is connected.
- Narration drives video timing — if a segment has 10 words of narration but 30 seconds of footage, the footage plays at ~6x speed. Write more narration for sections you want the viewer to linger on.
- The intro/outro video backgrounds default to empty (clean motion graphics). Set `introVideoSrc`/`outroVideoSrc` in narration.json to override.

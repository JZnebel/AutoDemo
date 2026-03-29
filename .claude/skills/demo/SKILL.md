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
4. **If a brief was provided** (`--brief`), use it to guide your exploration. The brief tells you what the user cares about — prioritize those features. If no brief, explore freely.
5. Identify the key features, navigation, and interesting flows
6. Plan 3-6 demo segments that showcase the app in ~`duration` seconds of narration

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

1. Create the output directory
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

Note: `--script /dev/null` with `--skip-record` tells the pipeline to use existing recordings in the output dir. The pipeline handles:
- TTS generation from narration text
- WhisperX word-level alignment for captions
- Per-segment speed matching (narration drives video timing)
- Remotion render with intro card, captions, progress bar, outro card

### Phase 5: Optimize

Create an email-friendly compressed version:

```bash
ffmpeg -y -i final-output/<name>.mp4 \
  -c:v libx265 -preset medium -crf 28 -tag:v hvc1 \
  -c:a aac -b:a 128k \
  -vf "scale=1920:1080" \
  final-output/<name>-compressed.mp4
```

### Done

Report to the user:
- Full quality: `final-output/<name>.mp4`
- Compressed: `final-output/<name>-compressed.mp4`
- Duration and file sizes
- Bundle location for re-rendering: `screencast-output/<name>/bundle-*/`

## Important Notes

- The screencast recording requires Chrome DevTools MCP to be running. If MCP tools fail, tell the user to ensure Chrome is open and the MCP server is connected.
- Narration drives video timing — if a segment has 10 words of narration but 30 seconds of footage, the footage plays at ~6x speed. Write more narration for sections you want the viewer to linger on.
- The intro/outro video backgrounds default to empty (clean motion graphics). Set `introVideoSrc`/`outroVideoSrc` in narration.json to override.

# Editor Export — Ship AutoDemo bundles to real NLEs

## Goal

After autodemo finishes, run one command to produce an editor-ready package that opens in Premiere, Resolve, FCP, or CapCut with clips + narration already on the timeline.

```bash
node scripts/export-editor.mjs screencast-output/<name>/bundle-<date>/
# → creates screencast-output/<name>/editor-export/
```

## Output Structure

```
editor-export/
├── clips/                          # Speed-matched segment clips, numbered + labeled
│   ├── 01-sign-up.mp4
│   ├── 02-industries.mp4
│   ├── 03-ai-builder.mp4
│   └── ...
├── audio/
│   ├── narration-full.mp3          # Complete narration audio
│   ├── 01-sign-up.mp3             # Per-segment narration splits
│   ├── 02-industries.mp3
│   └── ...
├── subtitles/
│   ├── captions.srt                # Full narration subtitles
│   └── captions.vtt                # Same in VTT
├── assets/
│   ├── logo.webp                   # Brand logo captured during scout
│   └── music-bed.mp3              # Background music (if used)
├── raw/
│   └── recording.mp4              # Full unedited source footage
├── timeline.xml                    # FCP7 XML — works in Premiere, Resolve, FCP
├── capcut/                         # CapCut project (stretch goal)
│   └── draft_content.json
└── README.txt                      # What's what, segment list, re-render command
```

## Phase 1: Core Export (FCP7 XML + assets)

### 1a. Split narration audio per-segment

Use ffmpeg to slice `narration.mp3` at segment boundaries (already known from `manifest.json` audioDuration values).

```bash
ffmpeg -i narration.mp3 -ss 0 -t 6.837 01-sign-up.mp3
ffmpeg -i narration.mp3 -ss 6.837 -t 15.5 02-industries.mp3
# etc.
```

### 1b. Generate FCP7 XML timeline

FCP7 XML is the universal interchange format. Simpler than FCPXML, supported by Premiere, Resolve, and FCP.

**Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>AutoDemo - Velvet Bison Bistro</name>
    <rate><timebase>30</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <track>
          <!-- Each segment clip as a <clipitem> on V1 -->
          <clipitem>
            <name>01 - Sign Up</name>
            <start>0</start>
            <end>201</end>  <!-- 6.7s × 30fps -->
            <file><pathurl>file://clips/01-sign-up.mp4</pathurl></file>
          </clipitem>
          <!-- next clip starts where previous ends -->
        </track>
      </video>
      <audio>
        <track>
          <!-- Each narration segment on A1, synced to video -->
          <clipitem>
            <name>Narration - Sign Up</name>
            <start>0</start>
            <end>201</end>
            <file><pathurl>file://audio/01-sign-up.mp3</pathurl></file>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
```

**Key decisions:**
- Use **relative file paths** (`clips/01-sign-up.mp4`) so the whole folder is portable
- Frame rate: 30fps (matching Remotion output)
- Sequence resolution: 1920×1080 (or match recording resolution)
- Each `<clipitem>` gets a `<marker>` with the scene label for easy navigation

**npm dependency:** `@bbc/fcpx-xml-composer` can help, or we hand-write the XML — it's simple enough for a flat sequence with no effects.

### 1c. Generate SRT from word timings

Already have `narration.vtt` in the bundle. Convert to SRT (trivial format difference). Include both.

### 1d. README.txt

Auto-generated with:
- Demo name, date, duration
- Segment list with timestamps and descriptions
- How to import into Premiere / Resolve / FCP (2-line instructions each)
- Re-render command from manifest

## Phase 2: CapCut Export (stretch goal)

CapCut stores projects as `draft_content.json` in a specific folder structure. The Python package **CapGenie** can create these programmatically.

**Approach:**
- Either shell out to a small Python script using CapGenie
- Or reverse-engineer the JSON format directly (it's documented enough)

**CapCut project structure:**
```
capcut/
├── draft_content.json    # Timeline, tracks, clips, text
├── draft_meta_info.json  # Project metadata
└── Resources/            # Symlinks or copies of media files
```

Each clip is a JSON object with `source_timerange`, `target_timerange`, `material_id`, etc. Text/subtitles are separate track items.

**Decision:** Punt to Phase 2 unless there's demand. FCP7 XML covers the major editors.

## Phase 3: Resolve Push (optional)

DaVinci Resolve has a Python scripting API (`DaVinciResolveScript`) that can:
- Create a project
- Create a timeline
- Add clips to tracks
- Set markers

This requires Resolve to be running. Could be a `--push-to-resolve` flag that opens the project directly instead of exporting files.

**Decision:** Nice-to-have, not core. Requires Resolve installed.

## Integration with autodemo

### Option A: Separate script (recommended for now)
```bash
node scripts/export-editor.mjs screencast-output/trafficstores-v3/bundle-2026-03-31/
```

### Option B: Flag on autodemo
```bash
node scripts/autodemo.mjs ... --export-editor
```
Runs the export automatically after the bundle step.

### Option C: Both
Build as a standalone script, then wire it into autodemo as an optional final step.

## Input: What we already have in the bundle

| File | What it gives us |
|------|-----------------|
| `manifest.json` | Segment names, audio durations, file paths |
| `segments/*.mp4` | Speed-matched clips, already labeled |
| `narration.mp3` | Full narration audio |
| `narration.json` | Segment text, scene labels, intro/outro metadata |
| `word-timings.json` | Word-level timestamps for subtitle generation |
| `narration.vtt` | Pre-built WebVTT subtitles |
| `final.mp4` | Complete rendered video (for reference) |

Everything needed is already in the bundle — this is purely a packaging/format conversion step.

## Estimated effort

- **Phase 1 (FCP7 XML + assets):** ~2-3 hours. Mostly XML template + ffmpeg splits.
- **Phase 2 (CapCut):** ~2-4 hours. JSON reverse engineering.
- **Phase 3 (Resolve push):** ~1-2 hours if Python API is available.

## Open questions

1. Should raw unspeed-matched footage segments also be included? (editors might want to re-time themselves)
2. Include the Remotion-rendered overlays (captions, lower thirds) as transparent ProRes layers?
3. Should the music bed be on a separate audio track in the XML?
4. What sequence resolution? Match source recording (1660×1236) or standard 1920×1080?

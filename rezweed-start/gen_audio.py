"""
Narration + word timings for the /start clips.

Uses edge_tts directly rather than the CLI: the CLI only writes sentence-level
SRT, while the library emits a WordBoundary per word when asked (7.x defaults to
SentenceBoundary). Those timings come from the synthesiser, so they are exact --
no Whisper pass and no transcription error.

A clip is either `text` (one continuous read) or `segments` -- lines pinned to a
start time. Segments exist because a continuous read drifts against the footage:
on the step-3 clip it ran ~6s ahead by the middle and announced the Products tab
while the hours editor was still on screen. Pinning each line to the beat it
describes is the same principle the rest of this repo works on, narration and
picture agreeing rather than one being stretched to the other.
"""
import asyncio, json, pathlib, subprocess, tempfile, edge_tts

SPEC = json.loads(pathlib.Path("rezweed-start/narration.json").read_text())
OUT = pathlib.Path("rezweed-start/audio")
OUT.mkdir(parents=True, exist_ok=True)


async def synth(text, path):
    """One line to disk; returns its word timings in ms from the line's own start."""
    comm = edge_tts.Communicate(text, SPEC["voice"], rate=SPEC["rate"], boundary="WordBoundary")
    words = []
    with open(path, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({                      # offsets arrive in 100ns ticks
                    "word": chunk["text"],
                    "startMs": chunk["offset"] / 10_000,
                    "endMs": (chunk["offset"] + chunk["duration"]) / 10_000,
                })
    return words


def duration(path):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True).stdout.strip())


async def one(clip):
    mp3 = OUT / f'{clip["id"]}.mp3'

    if "segments" in clip:
        with tempfile.TemporaryDirectory() as tmp:
            parts, words, prev_end = [], [], 0.0
            for i, seg in enumerate(clip["segments"]):
                part = pathlib.Path(tmp) / f"{i}.mp3"
                # atSec is the EARLIEST this line may start. If the line before it
                # ran long, push this one back rather than let two lines speak over
                # each other -- overlapping narration is unlistenable, and a line
                # landing slightly late is only slightly late.
                at_s = max(seg["atSec"], prev_end + 0.25)
                if at_s > seg["atSec"] + 0.01:
                    print(f'  · {clip["id"]} line {i} pushed {seg["atSec"]}s -> {at_s:.1f}s')
                at = at_s * 1000
                for w in await synth(seg["text"], part):
                    words.append({"word": w["word"],
                                  "startMs": w["startMs"] + at,
                                  "endMs": w["endMs"] + at})
                dur = duration(part)
                print(f'    line {i}: {dur:.1f}s  {at_s:.1f}-{at_s + dur:.1f}s')
                parts.append((part, at))
                prev_end = at_s + dur
            # Lay each line onto a common timeline at its own offset.
            cmd = ["ffmpeg", "-v", "error", "-y"]
            for part, _ in parts:
                cmd += ["-i", str(part)]
            filt = "".join(f"[{i}]adelay={int(at)}|{int(at)}[a{i}];" for i, (_, at) in enumerate(parts))
            filt += "".join(f"[a{i}]" for i in range(len(parts)))
            filt += f"amix=inputs={len(parts)}:normalize=0[out]"
            cmd += ["-filter_complex", filt, "-map", "[out]", "-b:a", "128k", str(mp3)]
            subprocess.run(cmd, check=True)
    else:
        words = await synth(clip["text"], mp3)

    (OUT / f'{clip["id"]}.words.json').write_text(json.dumps(words, indent=1))
    print(f'{clip["id"]}: {len(words)} words, audio {duration(mp3):.1f}s, '
          f'last word ends {words[-1]["endMs"] / 1000:.1f}s')


async def main():
    for clip in SPEC["clips"]:
        await one(clip)

asyncio.run(main())

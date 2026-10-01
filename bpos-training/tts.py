"""
Synthesise a clip's narration, one file per line, before the clip is recorded.

    python3 bpos-training/tts.py <clip-id> <lang>

Writes audio/<clip>/<lang>/<line>.mp3, <line>.words.json (word timings from the
synthesiser itself -- edge_tts emits a WordBoundary per word when asked, so no Whisper
pass) and durations.json, which the recorder reads to pace the recording to the voice.
"""
import asyncio, json, pathlib, subprocess, sys, edge_tts

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "narration.json").read_text())


def duration(path):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True).stdout.strip())


async def synth(text, voice, rate, path):
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
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


async def main(clip_id, lang):
    clip = next(c for c in SPEC["clips"] if c["id"] == clip_id)
    v = SPEC["voices"][lang]
    out = HERE / "audio" / clip_id / lang
    out.mkdir(parents=True, exist_ok=True)
    durations = {}
    for line in clip["lines"]:
        mp3 = out / f'{line["id"]}.mp3'
        words = await synth(line[lang], v["voice"], v["rate"], mp3)
        (out / f'{line["id"]}.words.json').write_text(json.dumps(words, ensure_ascii=False, indent=1))
        # The words end before the file does (trailing silence); pace on the spoken part.
        durations[line["id"]] = round(words[-1]["endMs"] / 1000, 3) if words else duration(mp3)
        print(f'  {lang} {line["id"]}: {durations[line["id"]]:.1f}s')
    (out / "durations.json").write_text(json.dumps(durations, indent=1))
    print(f'{clip_id} [{lang}]: {sum(durations.values()):.1f}s of narration')


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))

# AutoDemo

**Claude Code uses your app the way a real person would — and films it.**

Point it at a feature. Claude writes the walkthrough as a short script, AutoDemo films it with a
visible pointer and a narrator, checks that every step actually worked and that the screen
matches what's being said, and renders a captioned video for your help site — in every
language your app ships.

When your UI changes, re-shoot with one command. When a step no longer works, the take fails
and tells you where. When a French screen still says something in English, that fails too.

```bash
node core/cli.mjs make brotherpos making-a-sale            # English and French, verified, rendered
node core/cli.mjs ship brotherpos making-a-sale            # onto the help site, live
```

## What it's been used for

- **[BrotherPOS](examples/brotherpos)** — 127 help-site clips in English and French (254 videos)
  for a point-of-sale system, filmed in a store that's rebuilt before every take.
- **[RezWeed](examples/rezweed)** — owner and customer walkthroughs for a cannabis directory,
  including a clip that crosses from the shop's till to the customer's phone.

**Filming turned up real bugs** — because a script that uses the app like a person, in two
languages, on camera, hits the things unit tests don't:

- ~1,120 back-office texts that still showed English on French pages
- money, percentages and dates formatted the English way in French ("$20.00", "28.0%")
- a product importer that silently dropped every product's size
- every import failure reported as "Could not read that export", including an out-of-credits AI call
- a database rule that silently dropped six kinds of tracked events
- a crash in the register's Recall list, a broken email fallback, and more

## How it works

```
narration.json  ─ the lines, per language          flows/<clip>.mjs ─ what to click, typed by Claude
        │                                                   │
        ▼                                                   ▼
   tts.py  → one audio file per line ──────────→  record: reset the app, then drive Chrome
                                                   paced to the voice — ctx.line("id") waits
                                                   until the line before it has been spoken
                                                            │
                                                            ▼
                                                   checks: was every step done? is there
                                                   English on a French screen? does the
                                                   screen show what the line names?
                                                            │
                                                            ▼
                                                   finish: cut dead time, zoom on what each
                                                   line is about, captions, -16 LUFS, review
                                                            │
                                                            ▼
                                                   ship: the help site, built and live
```

A flow is a short file Claude writes by exploring your app:

```js
export const meta = { seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }   // not filmed

export async function run(ctx) {
  await ctx.line("tap");                                   // "Tap a product, and it goes into the cart."
  await ctx.click((await productCard(ctx.page, "House Pre-Roll 1g")).sel);
  await ctx.line("cash");                                  // "When they pay cash, tap Cash..."
  await ctx.click('[data-tour="tender-cash"]');
  await ctx.expect(() => saleCompleted(ctx.page), "the sale didn't complete");
  await ctx.finishSpeaking();
}
```

The recorder does the rest:

- **Takes that hold up on a real, slow app.** Every action waits for its target to be on
  screen and still, re-finds it if the page redrew it, then waits for whatever the action
  started (a save, a page load) to finish. Flows check their results. A failed take is retried
  from a fresh reset.
- **Paced to the voice.** The recording runs as long as the narration needs, so a French read
  that runs longer simply makes a longer French take — nothing is hand-timed.
- **Screen checks.** The recorder reads the visible text every second. Untranslated text stops
  the clip before it renders; a line naming a button that never appears, a spinner held on
  screen, or a toast over a control as it's clicked are flagged.
- **An edit that looks deliberate.** Dead time where nobody speaks and the screen only waits on
  the server is cut. The picture zooms in on the controls each line works with. Captions,
  loudness at -16 LUFS, a poster frame, a review of the render with sample frames.
- **Batches.** `--queue` resumes after an interruption, `--jobs 2` records two takes at once,
  rendering runs behind the next recording.

## Set up a project

A project is a folder: `autodemo.config.mjs`, `narration.json` and `flows/`. The config says
how to drive *your* app — every key is optional except `languages`:

```js
export default {
  languages: ["en", "fr"],
  async reset({ flags, lang }) { /* put the app in a known state: seed a store, run a cleanup */ },
  labels: () => [/* [english, [french...]] — your app's own strings, for the untranslated check */],
  guards: [{ name: "offline", check: async (page) => /* text that must never be on camera */ null }],
  docs: { videos, root, deploy },   // a Docusaurus help site to ship to
};
```

[`core/project.mjs`](core/project.mjs) documents every key, and the two
[examples](examples) show them in use — one with a database seeded in Docker and two languages,
one with cleanup scripts against a hosted database and a phone-sized shot.

**How much access you need:**

| You have | You get |
|---|---|
| a URL and a login | filmed, narrated walkthroughs (no reset: takes change real data) |
| + a staging app and a reset command | verified, repeatable takes; a library of flows you re-shoot when the UI changes |
| + the source | the untranslated-text check from your own strings, stable `data-*` anchors, seeded data |

## Commands

```
node core/cli.mjs make    <project> <clip ...|--all> [--lang en,fr] [--jobs N] [--queue] [--max-minutes M]
node core/cli.mjs status  <project>
node core/cli.mjs record  <project> <clip> <lang> [--dry]      # one take; --dry rehearses
node core/cli.mjs check   <project> <clip> <lang>              # screen checks on a take
node core/cli.mjs finish  <project> <clip> <lang>              # edit + render a take
node core/cli.mjs ship    <project> [clip ...] [--no-deploy]   # publish, build, deploy
```

## Install

Node 18+, Python 3, ffmpeg and Google Chrome.

```bash
git clone https://github.com/JZnebel/AutoDemo.git && cd AutoDemo
npm install && (cd demo-render && npm install)
pip install edge-tts
```

Narration uses Microsoft's free neural voices through `edge-tts`; captions come from the
voice's own word timings, so there's no transcription step.

## Other pipelines in this repo

Older, still working, not built on the core:

- **`/demo <url>`** (Claude Code slash command) — Claude explores a URL live through a
  [Chrome DevTools MCP fork](https://github.com/JZnebel/humanchromedevtools) (a submodule; `git clone --recursive`) with screencast
  recording, writes narration, and renders a marketing-style video
  (`scripts/autodemo.mjs`). Quick, but not verified or repeatable.
- **Screencast, marketing, pitch and stitch pipelines** — `node cli.mjs help`.

See [CLAUDE.md](CLAUDE.md) for how all of it fits together.

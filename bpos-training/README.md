# BrotherPOS training videos

Short narrated how-to clips for the BrotherPOS help site (docs.brotherpos.ca), in English
and French, filmed in a seeded cannabis demo store. Built on the `rezweed-start/` approach:
each clip is a script that drives a real browser, so when a screen changes the clip is
re-shot with one command instead of being re-recorded by hand.

```bash
node bpos-training/make.mjs making-a-sale          # both languages, then publish to the docs
node bpos-training/make.mjs --all --lang fr        # every clip, French only
```

Then build and ship the docs as usual. The videos land in
`knowledge-base/static/videos/` (not in git), so they go out with the build.

## The store

`seed.mjs` deletes and rebuilds **Riverstone Cannabis** (`riverstone.lvh.me:3001`) before
every take, so each one starts identical. It is set up like the stores these videos are for,
Indigenous cannabis stores: cannabis features on, **0% tax**, and **no compliance features**
(no ID check, no daily purchase limit, no SLGA reporting), so none of that shows on camera.
Staff are Morgan (owner), Sam (manager) and Riley (clerk). Their password and PINs are minted
once into `.local/creds.json` (gitignored) and never committed, because this repo is public.

It writes to whatever Rails the config points at (default: the local Docker dev app,
container `pos_app`). Point it at a dev machine, never production.

## How a clip is made

1. **Narration first.** `narration.json` has each clip's lines in `en` and `fr`. `tts.py`
   synthesises them with edge-tts (en-CA Clara, fr-CA Sylvie) and keeps the word timings the
   synthesiser reports, so there's no Whisper pass.
2. **Record, paced to the voice.** A flow (`flows/<clip>.mjs`) calls `ctx.line("id")` before
   each beat. The recorder waits until the previous line has finished speaking, marks the time,
   and the actions that follow happen while that line is heard. French runs longer than English,
   so the French recording is simply longer, in step with its own voice. Nothing is hand-timed,
   and a re-shoot after a UI change stays in sync. The register is filmed at 1600×900, the
   smallest size where the cash keypad fits without scrolling.
3. **Guard.** `run-flow.mjs` watches the register's sync badge and throws a take away if it
   ever shows Offline (that would teach the wrong thing); `make.mjs` retries.
4. **Render.** `finish.mjs` lays each line at its mark, renders the `TrainingClip` composition
   (demo-render/src/TrainingClip.tsx), which puts the captions in a strip **below** the picture,
   not over it, because the register's Cash / Complete Sale buttons live at the bottom edge.
   It then encodes a ~2 MB web copy and a poster frame.
5. **Publish.** `publish.mjs` copies them to the docs and updates `manifest.json`, which the
   docs' `<TrainingVideo id="..." />` player reads (EN/FR switch, remembers the choice).

## Adding a clip

1. Add it to `narration.json`: `id`, `flow`, `docs` (the page it belongs on), `title` and
   `lines` (`id`, `en`, `fr`). Write lines the way you'd say them to a new clerk. Name
   buttons exactly as they read on screen in each language.
2. Write `flows/<id>.mjs`: `meta` (`seed` flags, viewport), `setup(ctx, { lang })` (not
   recorded, e.g. `openRegister`), and `run(ctx)` with one `ctx.line()` per narration line, then
   `ctx.finishSpeaking()`. Find elements by `data-tour` anchors, or with `byText()` given both
   languages' labels.
3. Rehearse: `python3 bpos-training/tts.py <id> en && node bpos-training/seed.mjs ... &&
   node bpos-training/run-flow.mjs <id> en --dry`.
4. `node bpos-training/make.mjs <id>`, look at the frames, then add `<TrainingVideo id="<id>" />`
   to the docs page under its intro line.

## Gotchas

- The register caches the catalogue in IndexedDB. Since every seed makes new product ids,
  `openRegister` clears the origin's storage first, so each take is a fresh device.
- Re-build the register (`cd web && npm run build`) before shooting. `/pos` serves the built
  bundle, not source.
- Product, category and weight-preset names are store data, so they stay in English in the
  French clips. Everything the app itself says is translated.
- **Same label twice.** A window's button and the cart button behind it can read the same,
  for example "Apply Discount", or "Mettre en attente" in French for both Hold and Hold Order.
  Clicking the one behind lands on the window's backdrop and closes the window without
  doing anything. Use `topmost()` for any button inside a window.
- **Check the result, not just the clicks.** A flow should throw if the step didn't take
  effect, for example "the discount didn't apply". Then a bad take is retried rather than
  published. A rehearsal passing only proves every click found something.
- **Filming address.** The browser opens `<store>.brotherpos.ca`, and Chrome maps every
  `*.brotherpos.ca` address to the local server. That way the register brands itself
  Brother POS, and a run can never reach production.
- **Back-office labels.** `A("Next")` looks up the French label from the Rails locale
  files (via `admin-labels.py`). The register's `L()` uses its JSON translations.

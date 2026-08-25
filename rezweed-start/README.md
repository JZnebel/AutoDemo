# rezweed.com/start — owner walkthrough clips

Two clips for the `/start` page: **step 1 (claim your shop)** and **step 3 (details)**.
Step 2 has no clip on purpose — it is a person checking that an owner runs the shop,
and there is nothing to demonstrate.

## Setup

This repo is public and these scripts drive a real RezWeed instance, so nothing
instance-specific is committed. Copy `config.example.json` to `config.local.json`
(gitignored) and fill it in:

| key | what it is |
|---|---|
| `base` | the app under test — a **dev server**, see below |
| `envFile` | path to the app's `.env.local`, read at runtime for the service-role key |
| `storeId` | the store to film against — **use a honeypot/test listing** |
| `standCode` | that store's counter-QR stand code, for the customer-side flow |
| `ownerEmail` | throwaway owner account, created by seed-owner and deleted by cleanup |

Every one can also come from the environment (`REZ_BASE`, `REZ_ENV_FILE`,
`REZ_STORE_ID`, `REZ_STAND_CODE`, `REZ_DEMO_EMAIL`).

The demo owner's **password is never configured and never stored here**:
`seed-owner.mjs` mints a random one per run into `.local/owner.json` (gitignored)
and `signin.mjs` reads it back. Run seed-owner before anything that signs in.

These scripts write to whatever database `envFile` points at — claims, products,
members, a points ledger, a staff till. Point them at a store you are willing to
have written to, and run `cleanup.mjs` afterwards.

## Why this doesn't use the screencast MCP fork

It doesn't need to. `recorder.mjs` drives Chrome over CDP with `puppeteer-core` and
records with puppeteer's own `page.screencast()`. Two things it has to work around:

- **`scroll-behavior: smooth`** (rezweed `globals.css:217`) makes puppeteer's
  `ElementHandle.click()` stability check hang forever, so clicks go by computed
  coordinate and every target is re-resolved immediately before it is touched.
- **Chrome only emits a screencast frame when the compositor produces one**, so a page
  that goes still simply stops recording — which silently ate the "Claim Submitted!"
  confirmation. `window.__beat()` nudges an invisible element every 100ms to force
  frames. Without it the clip runs short and loses its own ending.

Chrome also never captures the OS pointer, so the recorder draws its own.

Launch Chrome with **software WebGL**, not `--disable-gpu`: the owner store manager renders
a Mapbox map, and without WebGL the page hits its error boundary and shows "This page
didn't load".

`record()` logs wall-clock elapsed — compare it against the container duration. The heavy
admin page over-generated frames (53.4s of video for 45.5s of action, playing ~17% slow);
normalise with `ffmpeg -filter:v "setpts=<wall/video>*PTS" -r 25`.

## Recording against production data

`localhost:3000` points at the **production** Supabase project, so recording writes real
rows. Two things make that safe:

- Both shops are honeypot listings — **Birchbark Cannabis Co.** (claim) and
  **Moonwater Reserve Cannabis** (details).
- `SENDGRID_API_KEY` is absent from `.env.local`, so the mailer no-ops on localhost and
  the claim emails nobody.

`cleanup.mjs` removes everything: the claim row, the temp owner (auth user +
`admin_users` + `store_owners`), the edits filed against Moonwater, and it restores the
store row from `moonwater-snapshot.json`. **Run it before every re-record too** — the
claim API returns 409 on a duplicate pending claim.

## Re-recording

```bash
node rezweed-start/cleanup.mjs                      # always first
node rezweed-start/seed-owner.mjs                   # temp owner for clip 2

# Chrome on its own port and profile, so it never touches your own browser
DISPLAY=:1 setsid --fork google-chrome --remote-debugging-port=9333 \
  --user-data-dir=/tmp/rz-chrome --window-size=1280,800 \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --no-first-run about:blank

REC_LOG=/tmp/rec.log node rezweed-start/run-flow.mjs \
  "$PWD/rezweed-start/flow-01-claim.mjs" "$PWD/rezweed-start/raw/01-claim.mp4"
REC_LOG=/tmp/rec.log node rezweed-start/run-flow.mjs \
  "$PWD/rezweed-start/flow-02-details.mjs" "$PWD/rezweed-start/raw/02-details.mp4"

python3 rezweed-start/gen_audio.py                  # narration + exact word timings
node rezweed-start/build-props.mjs

cd demo-render && for id in 01-claim 02-details; do
  cp ../rezweed-start/raw/$id.mp4 ../rezweed-start/audio/$id.mp3 public/rezweed/
  npx remotion render src/index.ts StartClip ../rezweed-start/out/$id.mp4 \
    --props=../rezweed-start/props/$id.json
done

node rezweed-start/cleanup.mjs                      # always last
```

Then encode (`-crf 30 -movflags +faststart`, ~1MB each), upload to the public
`start-videos` bucket, and the page picks them up — `/start` builds the URLs from
`NEXT_PUBLIC_SUPABASE_URL`, so nothing on the page changes.

Add `--dry` to `run-flow.mjs` to rehearse a flow without recording. It still writes to
the database.

## The four clips

| file | page | shot at |
|---|---|---|
| `01-claim` | `/start` step 1 | 1280x720 |
| `02-details` | `/start` step 3 | 1280x720 |
| `03-loyalty-owner` | `/start` rewards box | 1280x720 |
| `04-loyalty-customer` | `/card` | 390x844, phone frame |
| `05-tv-menu` | `/for-owners` + the TV menu tab | 1280x720 |
| `06-import` | the Products tab | 1280x720 |

## What each clip shows

**Step 1** — `/for-owners`: search, pick the shop, fill the claim form, submit, confirmation.

**Step 3** — the owner's **own store manager** at `/admin/stores/[id]`, which is where
signing in actually lands a `store_owner`. Dashboard → the "Get your listing ready"
checklist → hours in Edit Store → Save (checklist ticks 1/5 → 2/5) → the Products tab →
add a product via catalogue autocomplete → the product live on the menu.

Not the public listing's "Help us improve this listing" panel: that is the passer-by
suggestion path and queues edits for staff review. The store manager writes directly, and it
is the only place the menu can be built.

**Rewards, the shop's side** — `/admin/loyalty`. There is no "switch it on" step to film:
every active store already has `loyalty_enabled` true. The setup that matters is the staff
till link, so staff can serve the counter from their own phone without the owner's login.
Then the daily loop: number in, sign them up, amount spent, points recorded.

**Rewards, the customer's side** — `/j/<code>`, where the printed counter QR lands. The code
comes from `standCode` in your config; the honeypot store already had one, from the batch
minted for the acrylic stands. One tap,
a member code to read out, and the wallet buttons. Shot signed out, because a customer
scanning a counter card has no account and never needs one.

**The in-store TV menu** — `/admin/stores/[id]/tv-menu`, then the board itself. The builder
shows an empty state until a store has visible products, so `seed-menu.mjs` puts 26 on
Moonwater first and `cleanup.mjs` takes them away (they carry `source: 'demo'`).

Two things about this one:

- **Record it against a dev server, not `:3000`.** The `:3000` server is `next start` from an
  older build, so it will not show source changes. Pass `REZ_BASE=http://localhost:3007`.
- `TvMenuBuilder` used to build its links from `window.location.origin`, which put
  `localhost:3000/tv/XXXX` on camera. It now uses `NEXT_PUBLIC_BASE_URL || 'https://rezweed.com'`,
  the same form as `lib/sms.ts` and `lib/wallet/card-data.ts` — **that is a change to the app**,
  and it also means a TV link minted on a preview deploy points at the real site rather than
  dying with the preview. The flow rewrites the origin back to `REZ_BASE` for its own
  navigation so the shoot stays local.

NOT filmable: card recovery on `/card`. It rings the customer with a voice code (Twilio
refuses cannabis SMS), so it cannot be completed without answering a real phone call.

The staff PIN and till token are on camera in the owner clip. That is only safe because
`cleanup.mjs` deletes the `store_till_access` row, which kills the token — run it.

## Testing the product importer

`import-test.mjs <fixture.csv> [--add]` drives the real UI: Products tab → "Paste a menu" →
"Upload export" → file → Import, printing the API status and what the review step offered.
Without `--add` it stops before writing anything. `fixtures/pos-export.csv` is a deliberately
awkward POS export — coded departments (`FLOWER-IND`, `VAPE-CART`), non-obvious column names
(`Item Name`, `Dept`, `Retail`, `On Hand`), mixed price formats, blank cells, and five
non-cannabis lines to exercise the keep/drop grouping.

**`06-import` must be shot against a dev server** (`REZ_BASE=http://localhost:3007`), same
reason as the TV clip: the price_unit fix lives in source and `:3000` is an older build.

**The importer is AI-gated end to end** — upload, paste and photo all go through one OpenAI
mapping call, so none of the three work without credits on the key in `.env.local`. Errors are classified now: an empty file is a 400 that says so, an unavailable mapping call
is a 503 that says it is us, and only a genuinely unreadable file gets the "try exporting as
CSV" message.

The fixture doubles as a regression test. `price_unit` used to be dropped for every row, so a
menu imported with all its weights missing — check the review step's "Read as:" line actually
contains `price_unit ← Size`.

## Props

`build-props.mjs` writes one file per clip into `props/` (gitignored — derived
from `narration.json` and the recording). A clip that crosses between two shot
sizes carries a `shots` array instead of a single `videoSrc`, and the narration is
timed against the joined length:

```json
{ "audioSrc": "rezweed/07-loyalty.mp3",
  "wordTimings": [ { "text": "Rewards", "startMs": 902, "endMs": 1514 } ],
  "durationInFrames": 2509,
  "shots": [ { "videoSrc": "rezweed/07a.mp4", "frame": "none",  "durationInFrames": 2067 },
             { "videoSrc": "rezweed/07b.mp4", "frame": "phone", "durationInFrames": 442 } ] }
```

## Narration timing

`narration.json` clips are either `text` (one continuous read) or `segments` pinned to
`atSec`. `atSec` is the EARLIEST a line may start: `gen_audio.py` pushes a line later if the
one before it ran long, prints every push and every line's measured duration, and lays the
lines onto a common timeline with `adelay`. Watch the printed end time against the clip
length — if the last line ends past it, shorten a line rather than move it.

## Narration

`gen_audio.py` uses `edge_tts` directly rather than the CLI: the CLI only writes
sentence-level SRT, while the library emits a `WordBoundary` per word when asked
(`boundary="WordBoundary"` — 7.x defaults to sentences). Those timings come from the
synthesiser, so no Whisper pass and no transcription error. `build-props.mjs` re-attaches
punctuation from `narration.json`, without which the caption component never sees a
sentence end and breaks pages mid-sentence.

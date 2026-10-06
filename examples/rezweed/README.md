# RezWeed — owner and customer walkthrough clips

One of AutoDemo's example projects: help clips for rezweed.com's `/start`, `/card` and
`/for-owners` pages. The engine is in [`core/`](../../core); what's here is how to drive
RezWeed — `autodemo.config.mjs`, the reset scripts (`cleanup.mjs`, `seed-owner.mjs`,
`seed-menu.mjs`), sign-in, and the flows.

Step 2 of `/start` has no clip on purpose — it is a person checking that an owner runs the
shop, and there is nothing to demonstrate.

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

## How it's filmed

These run on AutoDemo's core (`core/`), like the BrotherPOS example: each clip's
`narration.json` lines are synthesised first, then the flow in `flows/` is recorded paced to
them — `ctx.line("id")` marks where a line starts and waits for the one before it to finish.
`autodemo.config.mjs` is what's specific to rezweed: the reset (below), captions over the
picture, and Chrome on port 9333.

Launch Chrome with **software WebGL**, not `--disable-gpu` (the core does): the owner store
manager renders a Mapbox map, and without WebGL the page hits its error boundary and shows
"This page didn't load".

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

Start the app's dev server on the port in `config.local.json` (`base`), then:

```bash
node core/cli.mjs make rezweed 01-claim               # one clip
node core/cli.mjs make rezweed --all                  # all of them
node core/cli.mjs record rezweed 02-details en --dry  # rehearse a flow (it still writes to the database)
```

`make` runs `cleanup.mjs` and `seed-owner.mjs` before every take (and `seed-menu.mjs` for a
flow with `seed: ["--menu"]`), and `cleanup.mjs` once more at the end. Finished clips land in
`out/`; encode-and-upload to the public `start-videos` bucket is still by hand, and the pages
pick them up — `/start` builds the URLs from `NEXT_PUBLIC_SUPABASE_URL`.

**Signing in needs Cloudflare Turnstile to load.** The sign-in page and the claim form wait for
the Turnstile widget; if the filming machine can't reach `challenges.cloudflare.com`, every flow
that signs in or submits a claim fails at that step.

## The clips

| file | page | shot at |
|---|---|---|
| `01-claim` | `/start` step 1 | 1280x720 |
| `02-details` | `/start` step 3 | 1280x720 |
| `04-loyalty-customer` | `/card` | 390x844, phone frame |
| `05-tv-menu` | `/for-owners` + the TV menu tab | 1280x720 |
| `06-import` | the Products tab | 1280x720 |
| `07-loyalty` | `/start` rewards box | two shots: the till at 1280x720, then the customer's phone (390x844, phone frame) |

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


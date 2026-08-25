import { BASE } from "./recorder.mjs";
/**
 * Rewards, part one: the shop's side. Shot desktop, at /admin/loyalty.
 *
 * Pairs with flow-07b (the customer's phone) to make one clip — see the `shots`
 * prop on StartClip. Neither half stands in for the other: the till is a desktop
 * screen and the card is a phone.
 *
 * Covers, in order: setting what a point is worth, the staff till link, that a
 * lost PIN is replaced rather than recovered, signing a walk-in up by phone,
 * handing the card to their phone, recording a sale, and spending the points.
 *
 * The rate and the redemption are both new (20260905/20260906) and are the reason
 * this clip was reshot: the first cut had to say "there is no redeeming" and
 * "what a point is worth is yours to decide" with nothing on screen to point at.
 * Now both are real controls, so the clip shows them instead of explaining them.
 */
const PHONE = "9055550177";
const SPEND = "60";
const WORTH = "0.10";         // 10c a point. At the default 1pt/$1 this is 10% back,
                              // which trips the till's own warning — that is the point.
const EARN = "0.2";           // dialled back to a point per $5, which lands on 2%.
const SPEND_PTS = "10";       // a $60 sale at 0.2/dollar earns 12, so spending 10
                              // leaves a remainder — a balance that goes to zero
                              // hides whether the subtraction was real.
const REWARD = "$1 off a pre-roll";

export const meta = {
  name: "07a-loyalty-till",
  title: "Rewards — the till",
  url: `${BASE}/admin/loyalty`,
  viewport: { width: 1280, height: 720 },
};

/** The settings panels are separate cards with identical control labels — two
 *  Saves, two decimal inputs — so everything here is scoped to the card whose
 *  text begins with the heading, never matched globally. */
const inCard = (page, heading, name, css = "input", label = null) =>
  page.evaluate((h, n, c, lab) => {
    const card = [...document.querySelectorAll("div")]
      .filter((d) => (d.innerText || "").trim().startsWith(h) && d.querySelector("input"))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
    if (!card) return false;
    const el = lab
      ? [...card.querySelectorAll(c)].find((x) => x.innerText.trim() === lab)
      : card.querySelector(c);
    if (!el) return false;
    el.setAttribute("data-rec", n);
    return true;
  }, heading, name, css, label).then((ok) => {
    if (!ok) throw new Error(`not found: ${css}${label ? ` "${label}"` : ""} in card "${heading}"`);
    return `[data-rec="${name}"]`;
  });

const byText = (page, text, name, css = "button") =>
  page.evaluate((c, t, n) => {
    const el = [...document.querySelectorAll(c)].find((e) => (e.innerText || "").replace(/\s+/g, " ").trim() === t);
    if (!el) return false;
    el.setAttribute("data-rec", n);
    return true;
  }, css, text, name).then((ok) => {
    if (!ok) throw new Error(`not found: ${css} "${text}"`);
    return `[data-rec="${name}"]`;
  });

export async function setup(ctx) {
  const { page } = ctx;
  const { signIn } = await import("./signin.mjs");
  await signIn(ctx);
  await ctx.goto(meta.url);
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" });
  await ctx.settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.pause(1200);
}

export async function run(ctx) {
  const { page } = ctx;
  const SEARCH = 'input[placeholder="905 555 0134"]';

  // ── What this is ─────────────────────────────────────────────────────────
  await ctx.pause(2800);        // "record what they spent, or use their points"

  // ── The two settings, and why they only make sense together ──────────────
  // Set what a point is worth first. At the default of one point per dollar, ten
  // cents is a ten percent giveaway, and the till says so — that warning is the
  // most useful thing on the page and it should be on camera.
  const worth = await inCard(page, "What a point is worth", "worthbox");
  await ctx.scrollToEl(worth, { block: 0.3 });
  await ctx.pause(1300);        // "Not set — you decide each reward at the counter"
  await ctx.type(worth, WORTH, { delay: 220, settle: 600 });
  await ctx.clickDom(await inCard(page, "What a point is worth", "worthsave", "button", "Save"), { settle: 2600 });
  await ctx.waitForText("What this costs you");
  await ctx.pause(3400);        // "A $50 sale earns 50 points, worth $5.00 — 10% back" + the warning

  // Now dial the earning back, and watch the same panel land on something sane.
  const earn = await inCard(page, "Points for spending", "earnbox");
  await ctx.scrollToEl(earn, { block: 0.28 });
  await ctx.pause(900);
  await ctx.type(earn, EARN, { delay: 240, settle: 600 });
  await ctx.clickDom(await inCard(page, "Points for spending", "earnsave", "button", "Save"), { settle: 2600 });
  await ctx.waitForText("One point for every");
  await ctx.pause(3200);        // "One point for every $5 spent." and "— 2% back", warning gone

  // ── A till your staff can use ────────────────────────────────────────────
  const create = await byText(page, "Create a staff till link", "createtill");
  await ctx.scrollToEl(create, { block: 0.3 });
  await ctx.pause(700);
  await ctx.clickDom(create, { settle: 2200 });
  await ctx.waitForText("Write this PIN down now");
  await ctx.pause(2800);        // the PIN, and the link staff bookmark

  // A PIN shown once and never again reads as a trap unless you also see that a
  // new one is always a tap away. POINTED AT, not clicked: it fires a native
  // confirm() that Chrome paints outside the page, so a click would show nothing
  // happening and then a PIN quietly changing.
  await ctx.pointAt(await byText(page, "New link & PIN", "newpin"), { settle: 2600 });

  // ── A customer at the counter ────────────────────────────────────────────
  await ctx.scrollToEl(SEARCH, { block: 0.16 });
  await ctx.pause(700);
  await ctx.type(SEARCH, PHONE, { delay: 105, settle: 500 });
  await ctx.clickDom(await byText(page, "Find", "find"), { settle: 1900 });
  await ctx.waitForText("is not a member yet");
  await ctx.pause(1800);        // "No account needed"

  await ctx.clickDom(await byText(page, "Join with this number", "join"), { settle: 2300 });
  await ctx.waitForText("Record");
  await ctx.pause(1200);

  // ── Handing them the card ────────────────────────────────────────────────
  await ctx.clickDom(await byText(page, "Put this on their phone", "qr"), { settle: 2300 });
  await ctx.pause(3000);        // turn the screen round; they scan it
  await ctx.clickDom(await byText(page, "Done", "qrdone"), { settle: 1600 });

  // ── Earning ──────────────────────────────────────────────────────────────
  const amount = await page.evaluate(() => {
    const i = [...document.querySelectorAll("input")].find((x) => x.placeholder === "0.00");
    if (!i) return null;
    i.setAttribute("data-rec", "amount");
    return '[data-rec="amount"]';
  });
  if (!amount) throw new Error("no amount field");
  await ctx.type(amount, SPEND, { delay: 190, settle: 900 });
  await ctx.clickDom(await byText(page, "Record", "record"), { settle: 2400 });
  await ctx.waitForText("RECENT");
  await ctx.pause(2400);        // "Added 60 points. They now have 60."

  // ── Spending ─────────────────────────────────────────────────────────────
  await ctx.scrollToEl(SEARCH, { block: 0.16 });
  await ctx.type(SEARCH, PHONE, { delay: 85, settle: 400 });
  await ctx.clickDom(await byText(page, "Find", "find2"), { settle: 2200 });
  await ctx.pause(2200);        // "60 · 1 visit · $6.00 here"

  await ctx.clickDom(await byText(page, "Use points", "openredeem"), { settle: 1900 });
  await ctx.waitForText("Use points from this card");
  await ctx.pause(1800);        // "takes the points off so they cannot be used twice"

  await ctx.type('input[placeholder="Points"]', SPEND_PTS, { delay: 260, settle: 1400 });
  await ctx.pause(900);         // "50 points = $5.00 off" appears as they type
  await ctx.type('input[placeholder^="What for"]', REWARD, { delay: 78, settle: 900 });

  // Two buttons read "Use points" — the one that opened the panel and the one
  // inside it that commits. Take the one inside the panel.
  const confirm = await page.evaluate(() => {
    const panel = [...document.querySelectorAll("div")]
      .filter((d) => /Use points from this card/.test(d.innerText || ""))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
    const b = [...(panel || document).querySelectorAll("button")]
      .find((x) => x.innerText.replace(/\s+/g, " ").trim() === "Use points");
    if (!b) return null;
    b.setAttribute("data-rec", "doredeem");
    return '[data-rec="doredeem"]';
  });
  if (!confirm) throw new Error("no confirm button inside the redeem panel");
  await ctx.clickDom(confirm, { settle: 2600 });

  await ctx.waitForText("Used ");
  await ctx.pause(3400);        // "Used 50 points. They have 10 left." and both ledger rows
}

import { BASE } from "./recorder.mjs";
import { STORE_ID } from "./config.mjs";
/**
 * Step 3 on /start — "Put your details and menu up".
 *
 * Shot in the owner's own store manager at /admin/stores/[id], which is where
 * signing in actually lands a store_owner. An earlier cut of this clip used the
 * public listing's "suggest an edit" panel; that was the wrong surface. That
 * panel queues changes for staff review, while the store manager is the owner's
 * own tool and writes directly — and it is the only place the menu can be built.
 *
 * Access needs an admin_users row of role store_owner AND a store_owners row for
 * this listing; see seed-owner.mjs. The [id] layout scopes owners to their own
 * stores and bounces them to /admin/stores otherwise.
 */


export const meta = {
  name: "02-details",
  title: "Put your details and menu up",
  url: `${BASE}/admin`,
};

async function byText(page, text, name, css = "button") {
  const ok = await page.evaluate((c, t, n) => {
    const el = [...document.querySelectorAll(c)].find((e) => (e.innerText || "").trim() === t);
    if (!el) return false;
    el.setAttribute("data-rec", n);
    return true;
  }, css, text, name);
  if (!ok) throw new Error(`not found: ${css} "${text}"`);
  return `[data-rec="${name}"]`;
}

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

  // ── The owner's dashboard ────────────────────────────────────────────────
  await ctx.pause(1700);                        // "Welcome, ... / Your Stores"

  const edit = await page.evaluate((id) => {
    const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === `/admin/stores/${id}`);
    if (!a) return null;
    a.setAttribute("data-rec", "openstore");
    return '[data-rec="openstore"]';
  }, STORE_ID);
  if (edit) await ctx.clickDom(edit, { settle: 800 });
  else await ctx.goto(`${BASE}/admin/stores/${STORE_ID}`);

  await ctx.waitForText("Get your listing ready");
  await ctx.settle();
  await ctx.pause(2000);                        // the checklist — what is left to do

  // ── Hours, in the owner's own editor ─────────────────────────────────────
  const hoursLabel = await page.evaluate(() => {
    const e = [...document.querySelectorAll("*")]
      .find((x) => x.children.length === 0 && x.innerText?.trim() === "Hours");
    e.setAttribute("data-rec", "hourslabel");
    return '[data-rec="hourslabel"]';
  });
  await ctx.scrollToEl(hoursLabel, { block: 0.12 });
  await ctx.pause(1100);

  const monOpen = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")]
      .filter((d) => /^Mon\b/.test(d.innerText.trim()) && d.querySelectorAll("button").length >= 3);
    const b = [...rows[rows.length - 1].querySelectorAll("button")].find((x) => x.innerText.trim() === "Open");
    b.setAttribute("data-rec", "monopen");
    return '[data-rec="monopen"]';
  });
  await ctx.click(monOpen, { settle: 1200 });

  const closeAt = await page.evaluate(() => {
    const t = [...document.querySelectorAll('input[type="time"]')];
    t[1].setAttribute("data-rec", "close");
    return '[data-rec="close"]';
  });
  await ctx.setTime(closeAt, "08:00 PM", { settle: 1200 });

  await ctx.clickDom(await byText(page, "Copy Monday to all days", "copy"), { settle: 1800 });

  const save = await byText(page, "Save Changes", "save");
  await ctx.scrollToEl(save, { block: 0.55 });
  await ctx.pause(500);
  await ctx.clickDom(save, { settle: 2600 });
  await ctx.pause(1200);

  // ── The menu ─────────────────────────────────────────────────────────────
  const products = await byText(page, "Products", "products", "a");
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.pause(700);
  await ctx.clickDom(products, { settle: 1500 });

  await ctx.waitForText("Menu / products");
  await ctx.settle();
  await ctx.pause(1000);

  const NAME = 'input[placeholder^="Product name"]';
  await ctx.type(NAME, "Blue Dream 3.5g", { delay: 105, settle: 1500 });

  // The name field is catalogue-assisted. Take a suggestion when one is offered —
  // that is the path this editor is built around — and carry on if none appears.
  const picked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .filter((b) => /blue dream/i.test(b.innerText) && b.offsetHeight > 0);
    if (!btns.length) return null;
    btns[0].setAttribute("data-rec", "suggest");
    return '[data-rec="suggest"]';
  });
  if (picked) { await ctx.clickDom(picked, { settle: 1600 }); }
  else ctx.note("no catalogue suggestion offered");

  await ctx.type('input[placeholder="Price"]', "45", { delay: 150, settle: 1200 });

  await ctx.clickDom(await byText(page, "Add", "add"), { settle: 2600 });

  // The form clears and the new row lands in the menu list below the fold. Without
  // this the clip ends on an empty form and never shows what the work produced.
  await ctx.waitForText("Blue Dream");
  const row = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div,li,tr")]
      .filter((e) => /Blue Dream/i.test(e.innerText || "") && e.querySelectorAll("input").length === 0)
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
    if (!el) return null;
    el.setAttribute("data-rec", "newrow");
    return '[data-rec="newrow"]';
  });
  if (row) await ctx.scrollToEl(row, { block: 0.42 });
  else ctx.note("new product row not locatable");
  await ctx.pause(3000);                        // the product, now on the menu
}

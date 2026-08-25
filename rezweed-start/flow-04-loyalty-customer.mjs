import { BASE } from "./recorder.mjs";
import { STAND_CODE } from "./config.mjs";
/**
 * Rewards, the customer's side — the counter QR.
 *
 * Shot at a phone viewport, because this only ever happens on a phone at a
 * counter, and the desktop layout of it is a layout nobody uses. The composition
 * puts it in a phone frame so it still sits in a 16:9 slot beside the others.
 *
 * /j/<code> is where the printed counter QR lands. ${STAND_CODE} is Moonwater's own
 * stand code, already minted — one of the 192 cut for the acrylic stands — so
 * nothing has to be created to film this.
 *
 * Signed OUT on purpose: a customer scanning a counter card has no account, and
 * the whole point of the page is that they never need one. Setup clears cookies
 * because the browser is otherwise still carrying the owner's session.
 */
export const meta = {
  name: "04-loyalty-customer",
  title: "Rewards — the customer's side",
  url: `${BASE}/j/${STAND_CODE}`,
  viewport: { width: 390, height: 844 },
};

export async function setup(ctx) {
  const { page } = ctx;
  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCookies");
  await client.detach();
  await ctx.goto(`${BASE}/`);
  await page.evaluate(() => {
    try { localStorage.setItem("rezweed_age_verified", "true"); sessionStorage.clear(); } catch {}
  });
  await ctx.goto(meta.url);
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" });
  await ctx.settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.pause(1200);
}

export async function run(ctx) {
  const { page } = ctx;

  await ctx.pause(3300);                        // "Collect points at ..." — what this is

  const tap = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "Get my card");
    if (!b) return null;
    b.setAttribute("data-rec", "getcard");
    return '[data-rec="getcard"]';
  });
  if (!tap) throw new Error('no "Get my card" button');

  await ctx.scrollToEl(tap, { block: 0.45 });
  await ctx.pause(1600);                        // "No account, no app, nothing to type."

  await ctx.clickDom(tap, { settle: 2400 });
  await ctx.waitForText("Your card is ready");
  await ctx.pause(4200);                        // the member code, big enough to read out

  // The wallet buttons are the answer to "what do I do with a code on a web page",
  // so the clip should not end before showing them.
  const wallet = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")]
      .find((e) => e.children.length === 0 && /Keep it on your phone/i.test(e.innerText || ""));
    if (!el) return null;
    el.setAttribute("data-rec", "wallet");
    return '[data-rec="wallet"]';
  });
  if (wallet) {
    await ctx.scrollToEl(wallet, { block: 0.22 });
    await ctx.pause(3600);
  } else ctx.note("wallet section not found");
}

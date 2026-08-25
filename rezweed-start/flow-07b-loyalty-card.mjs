import { BASE } from "./recorder.mjs";
import { STAND_CODE } from "./config.mjs";
/**
 * Rewards, part two: the customer's phone. Shot at 390x844, framed as a handset
 * by the composition and played straight after flow-07a in the same clip.
 *
 * This is the half the till cannot show: what the customer gets when they scan
 * the code the budtender just turned round — the member code, and the wallet
 * pass that puts it on their phone properly.
 *
 * Signed out on purpose: they have no account and never need one.
 */
export const meta = {
  name: "07b-loyalty-card",
  title: "Rewards — the card",
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
  await ctx.pause(1000);
}

export async function run(ctx) {
  const { page } = ctx;

  await ctx.pause(2400);        // "Collect points at …", one card for every shop

  const tap = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "Get my card");
    if (!b) return null;
    b.setAttribute("data-rec", "getcard");
    return '[data-rec="getcard"]';
  });
  if (!tap) throw new Error('no "Get my card" button');
  await ctx.scrollToEl(tap, { block: 0.45 });
  await ctx.pause(1200);
  await ctx.clickDom(tap, { settle: 2400 });

  await ctx.waitForText("Your card is ready");
  await ctx.pause(3000);        // the code they read out at the counter

  // The wallet pass is the point of this half — it is what stops the code being
  // a string on a web page they will never find again.
  const wallet = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")]
      .find((e) => e.children.length === 0 && /Keep it on your phone/i.test(e.innerText || ""));
    if (!el) return null;
    el.setAttribute("data-rec", "wallet");
    return '[data-rec="wallet"]';
  });
  if (wallet) {
    await ctx.scrollToEl(wallet, { block: 0.2 });
    await ctx.pause(4200);      // Apple Wallet / Google Wallet
  } else ctx.note("wallet section not found");
}

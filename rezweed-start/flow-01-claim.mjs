import { BASE } from "./recorder.mjs";
/**
 * Step 1 on /start — "Find your shop and claim it".
 *
 * Recorded against localhost:3000 (no SENDGRID_API_KEY there, so the mailer
 * no-ops and nobody is emailed) using the Birchbark Cannabis Co. honeypot
 * listing, which is `status: active` so it is searchable and `verified: false`
 * so it is claimable. The submissions row this creates is deleted afterwards by
 * cleanup.mjs, which leaves Birchbark claimable for the next re-record.
 */
export const meta = {
  name: "01-claim",
  title: "Claim your shop",
  url: `${BASE}/for-owners`,
};

/** Give an element matched by text a stable selector we can drive. */
async function tag(page, css, text, name) {
  const ok = await page.evaluate((c, t, n) => {
    const el = [...document.querySelectorAll(c)].find((e) => (e.innerText || "").trim().includes(t));
    if (!el) return false;
    el.setAttribute("data-rec", n);
    return true;
  }, css, text, name);
  if (!ok) throw new Error(`not found: ${css} containing "${text}"`);
  return `[data-rec="${name}"]`;
}

export async function setup(ctx) {
  const { page } = ctx;
  await ctx.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem("rezweed_age_verified", "true");
    sessionStorage.clear();
  });
  await ctx.goto(meta.url);
  // Kill smooth scrolling for the duration — we animate scrolls ourselves.
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.settle();
  await ctx.pause(800);
}

export async function run(ctx) {
  const { page } = ctx;
  const SEARCH = 'input[placeholder^="Type your store"]';

  await ctx.pause(1400);                       // land on the page
  await ctx.scrollToEl(SEARCH);
  await ctx.pause(500);

  await ctx.type(SEARCH, "Birchbark", { delay: 135, settle: 400 });
  await ctx.waitForText("Birchbark Cannabis Co.");
  await ctx.pause(1000);                       // let the result register

  const result = await tag(page, "div.z-20 button", "Birchbark Cannabis Co.", "result");
  await ctx.clickDom(result, { settle: 1800 });

  await ctx.waitForText("Claim this listing");
  await ctx.pause(1300);                       // modal settles

  await ctx.type('input[placeholder="Full name"]', "Dana Miller", { delay: 92, settle: 550 });
  await ctx.type('input[placeholder="your@email.com"]', "dana@birchbarkcannabis.ca", { delay: 68, settle: 550 });
  await ctx.type('input[placeholder="(555) 123-4567"]', "(519) 445-7790", { delay: 80, settle: 550 });
  await ctx.select("select", "owner", { settle: 1400 });

  const submit = await tag(page, "button", "Submit claim", "submit");
  await ctx.clickDom(submit, { settle: 600 });

  await ctx.waitForText("Claim Submitted!");
  await ctx.pause(3400);                       // hold on the confirmation
}

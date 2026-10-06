/** Products -> More Actions -> Tier Pricing -> edit AAA -> 3.5g price -> Save. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";

export const meta = { id: "pricing-tiers", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(3500);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/quality_tier_settings"]', { settle: 500 });
  await afterNav(ctx);

  await ctx.line("list");
  await ctx.pause(400);
  const row = await page.evaluate(() => {
    const tr = [...document.querySelectorAll("main tr")].find((r) => /^AAA\b/.test((r.innerText || "").trim()) && !/^AAAA/.test(r.innerText.trim()));
    tr?.setAttribute("data-rec", "aaa");
    const e = tr && [...tr.querySelectorAll("a")].find((a) => /\/edit$/.test(a.getAttribute("href") || ""));
    e?.setAttribute("data-rec", "aaa-edit");
    return !!e;
  });
  if (!row) throw new Error("no AAA row");
  await ctx.pointAt('[data-rec="aaa"]', { settle: 2500 });

  await ctx.line("edit");
  await ctx.click('[data-rec="aaa-edit"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="quality_tier_setting[pricing_matrix][3.5]"]' });
  await ctx.type('input[name="quality_tier_setting[pricing_matrix][3.5]"]', "20", { delay: 200, settle: 800 });

  await ctx.line("save");
  await ctx.click('form input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx);
  const ok = await page.evaluate(() => /3\.5g[^$]*\$20\b|3,5 g[^$]*20/.test(document.querySelector("main").innerText));
  if (!ok) throw new Error("the AAA 3.5g price didn't save as $20");
  await ctx.pointAt('[data-rec="aaa"], main tr:nth-of-type(2)', { settle: 1500 }).catch(() => {});
  await ctx.finishSpeaking();
}

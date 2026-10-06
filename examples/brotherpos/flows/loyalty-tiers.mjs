/** Customers -> Loyalty -> edit the Gold tier: 10% off and 1.5x points. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "loyalty-tiers", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/customers" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('main a.btn[href="/admin/loyalty"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="tiers-card"]' });

  await ctx.line("tiers");
  await ctx.pointAt('[data-tour="tiers-card"]', { settle: 2500 });

  await ctx.line("edit");
  const edit = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-tour="tiers-card"] tr, [data-tour="tiers-card"] li, [data-tour="tiers-card"] > div div')]
      .find((r) => /^\s*Gold\b/m.test(r.innerText) && r.querySelector('a[href*="/loyalty_tiers/"][href$="/edit"]'));
    const a = row?.querySelector('a[href*="/loyalty_tiers/"][href$="/edit"]');
    a?.setAttribute("data-rec", "edit-gold");
    return !!a;
  });
  if (!edit) throw new Error("no Gold tier edit link");
  await ctx.click('[data-rec="edit-gold"]', { settle: 500 });
  await afterNav(ctx, { selector: "#loyalty_tier_minimum_lifetime_spend" });

  await ctx.line("qualify");
  await ctx.pointAt("#loyalty_tier_minimum_lifetime_spend", { settle: 1200 });
  await ctx.pointAt("#loyalty_tier_minimum_visits", { settle: 1500 });

  await ctx.line("perks");
  await ctx.type("#loyalty_tier_discount_percentage", "10", { delay: 200, settle: 400 });
  await ctx.type("#loyalty_tier_points_multiplier", "1.5", { delay: 200, settle: 800 });

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('form input[type="submit"]')].filter((x) => x.offsetParent).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Update button");
  await ctx.click('[data-rec="save"]', { settle: 500 });
  await afterNav(ctx);
  if (await page.$("#loyalty_tier_discount_percentage")) throw new Error("the tier form came back with an error");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

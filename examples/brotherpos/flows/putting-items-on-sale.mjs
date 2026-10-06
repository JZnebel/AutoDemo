/** Products -> More Actions -> Sales Campaigns -> Create Campaign: 20% off Edibles. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "putting-items-on-sale", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(3200);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/sale_campaigns"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="create-campaign"]' });

  await ctx.line("new");
  await ctx.pause(600);
  await ctx.click('[data-tour="create-campaign"]', { settle: 500 });
  await afterNav(ctx, { selector: "#sale_campaign_name" });
  await ctx.type("#sale_campaign_name", "Edibles Weekend", { delay: 90, settle: 500 });

  await ctx.line("discount");
  await ctx.pointAt("#campaign-type-select", { settle: 1600 });
  await ctx.type("#sale_campaign_discount_value", "20", { delay: 200, settle: 700 });

  await ctx.line("dates");
  await ctx.pointAt("#sale_campaign_starts_at", { settle: 2200 });

  await ctx.line("what");
  await ctx.select("#apply-to-select", "categories", { settle: 1000 });
  const tagged = await page.evaluate(() => {
    const box = [...document.querySelectorAll('input[name="sale_campaign[category_ids][]"]')]
      .find((c) => c.offsetParent && /^Edibles$/.test((c.closest("label")?.innerText || "").trim()));
    box?.closest("label")?.setAttribute("data-rec", "edibles");
    return !!box;
  });
  if (!tagged) throw new Error("no Edibles category box");
  await ctx.click('[data-rec="edibles"]', { settle: 900 });

  await ctx.line("create");
  await ctx.click('form[action="/admin/sale_campaigns"] input[type="submit"][name="commit"]', { settle: 600 });
  await afterNav(ctx);
  const ok = await page.evaluate(async () => {
    const html = await (await fetch("/admin/sale_campaigns", { headers: { Accept: "text/html" } })).text();
    return /Edibles Weekend/.test(html);
  });
  if (!ok) throw new Error("the sale wasn't created");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

/** Sales Campaigns -> Create Campaign -> Freebie Threshold: a free pre-roll over $50. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "freebie-campaigns", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/admin/sale_campaigns" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('[data-tour="create-campaign"]', { settle: 500 });
  await afterNav(ctx, { selector: "#sale_campaign_name" });
  await ctx.select("#campaign-type-select", "freebie_threshold", { settle: 1200 });

  await ctx.line("name");
  await ctx.type("#sale_campaign_name", "Free Pre-Roll over $50", { delay: 70, settle: 400 });
  await ctx.type("#sale_campaign_min_spend_threshold", "50", { delay: 200, settle: 700 });

  await ctx.line("product");
  const id = await page.evaluate(() => [...document.querySelectorAll("#sale_campaign_freebie_product_id option")].find((o) => /House Pre-Roll 1g/.test(o.textContent))?.value);
  if (!id) throw new Error("House Pre-Roll isn't a free-product choice");
  await ctx.select("#sale_campaign_freebie_product_id", id, { settle: 900 });
  await ctx.type("#sale_campaign_freebie_quantity", "1", { delay: 200, settle: 700 });

  await ctx.line("auto");
  await ctx.pause(2200);

  await ctx.line("create");
  await ctx.click('form[action="/admin/sale_campaigns"] input[type="submit"][name="commit"]', { settle: 600 });
  await afterNav(ctx);
  if (await page.$("#sale_campaign_name")) throw new Error("the campaign form came back with an error");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

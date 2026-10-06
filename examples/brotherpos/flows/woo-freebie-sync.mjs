/** A freebie deal shown on the website: create it with "Display this freebie deal on
 *  WooCommerce site", and the website picks it up with its next settings check. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { wooSetup, wooPull, wpLogin, WP, WOO_RESOURCES } from "./_woo_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "woo-freebie-sync", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

const NAME = { en: "Free pre-roll over $50", fr: "Préroulé gratuit dès 50 $" };
let name = NAME.en;

export async function setup(ctx, { lang }) {
  name = NAME[lang] || NAME.en;
  wooSetup({ lang, pull: true });
  await openAdmin(ctx, { path: "/admin/sale_campaigns" });
  await wpLogin(ctx); // after openAdmin, which clears every cookie
  await goAdmin(ctx, "/admin/sale_campaigns");
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("create");
  await ctx.click('[data-tour="create-campaign"]', { settle: 500 });
  await afterNav(ctx, { selector: "#campaign-type-select" });
  await ctx.select("#campaign-type-select", "freebie_threshold", { settle: 900 });
  await ctx.type("#sale_campaign_name", name, { delay: 70, settle: 300 });

  await ctx.line("amount");
  await ctx.type("#sale_campaign_min_spend_threshold", "50", { delay: 150, settle: 300 });
  const pre = await page.$eval("#sale_campaign_freebie_product_id", (s) => [...s.options].find((o) => /Pre-Roll 1g/.test(o.text))?.value || "");
  await ctx.select("#sale_campaign_freebie_product_id", pre, { settle: 600 });

  await ctx.line("tick");
  await ctx.reveal("#sale_campaign_sync_to_woocommerce", { always: true });
  if (!(await page.$eval("#sale_campaign_sync_to_woocommerce", (e) => e.checked))) await ctx.click("#sale_campaign_sync_to_woocommerce", { settle: 600 });
  const save = await page.evaluate(() => {
    const f = document.querySelector("#sale_campaign_name")?.closest("form");
    const b = f && [...f.querySelectorAll('[type="submit"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Create Campaign");
  await ctx.click('[data-rec="save"]', { settle: 800 });
  await afterNav(ctx);

  await ctx.line("website");
  // The website collects the deal with its next settings check (every few minutes); run it now.
  wooPull();
  await ctx.goto(`${WP}/wp-admin/admin.php?page=wc-weight-pricing&tab=freebie-campaigns`);
  await ctx.expect(() => page.evaluate((n) => document.body.innerText.includes(n), name), "the deal never reached the website", 30000);
  await ctx.pause(1500);

  await ctx.line("shopper");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

/** RezWeed deals sync: a sale shown on the storefront goes to the RezWeed listing too. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "rezweed-deals", seed: ["--deals"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  railsRun(`store.update!(rezweed_enabled: true, sync_to_rezweed: true)`);
  await openAdmin(ctx, { path: "/products" });
}

const campaign = (kind) => railsRun(`puts SaleCampaign.where(campaign_type: "${kind}").first&.id`).trim();

export async function run(ctx) {
  const { page } = ctx;
  const sale = await campaign("discount") || railsRun(`puts SaleCampaign.where.not(campaign_type: "freebie_threshold").first.id`).trim();
  const freebie = campaign("freebie_threshold");
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/sale_campaigns"]', { settle: 500 });
  await afterNav(ctx, { selector: `main a[href="/admin/sale_campaigns/${sale}/edit"]` });
  await ctx.click(`main a[href="/admin/sale_campaigns/${sale}/edit"]`, { settle: 500 });
  await afterNav(ctx, { selector: 'input[type="checkbox"][name="sale_campaign[storefront_visible]"]' });
  await ctx.line("storefront");
  await ctx.reveal('input[type="checkbox"][name="sale_campaign[storefront_visible]"]', { always: true });
  await ctx.pointAt('input[type="checkbox"][name="sale_campaign[storefront_visible]"]', { settle: 1500 });
  await ctx.line("save");
  await ctx.click('form[action^="/admin/sale_campaigns/"] input[type="submit"][name="commit"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.line("off");
  await ctx.pause(1500);
  await ctx.line("freebie");
  await ctx.click(`main a[href="/admin/sale_campaigns/${freebie}/edit"]`, { settle: 500 });
  await afterNav(ctx, { selector: 'input[type="checkbox"][name="sale_campaign[show_on_rezweed]"]' });
  await ctx.reveal('input[type="checkbox"][name="sale_campaign[show_on_rezweed]"]', { always: true });
  await ctx.pointAt('input[type="checkbox"][name="sale_campaign[show_on_rezweed]"]', { settle: 2500 });
  await ctx.finishSpeaking();
}

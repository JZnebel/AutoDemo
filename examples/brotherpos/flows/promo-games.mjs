/** Promo games: switch them on, start from a ready-made game, check the prizes, activate. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "promo-games", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(500);
  await ctx.line("on");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="operations"]', { settle: 900 });
  await ctx.reveal('label[for="store_settings_enable_promo_games"], label[for="store_enable_promo_games"]', { always: true });
  await ctx.click('label[for="store_settings_enable_promo_games"], label[for="store_enable_promo_games"]', { settle: 500 });
  await updateSettings(ctx);
  await ctx.line("new");
  await navClick(ctx, "/admin/promo_games");
  await afterNav(ctx, { selector: '[data-tour="new-game-btn"]' });
  await ctx.click('[data-tour="new-game-btn"]', { settle: 700 });
  await afterNav(ctx, { selector: '[data-tour="discount-templates"]' });
  await ctx.line("templates");
  await ctx.pointAt('[data-tour="discount-templates"]', { settle: 900 });
  const use = 'form[action="/admin/promo_games/create_from_template"]:has(input[name="template_key"][value="wheel_discounts"]) [type="submit"]';
  await ctx.reveal(use, { always: true });
  await ctx.click(use, { settle: 900 });
  await afterNav(ctx, { selector: '[data-tour="prize-pool"]' });
  await ctx.line("prizes");
  await ctx.reveal('[data-tour="prize-pool"]', { always: true });
  await ctx.pointAt('[data-tour="prize-pool"]', { settle: 1500 });
  await ctx.line("activate");
  await ctx.reveal('form[action$="/toggle_active"] button', { always: true });
  await ctx.click('form[action$="/toggle_active"] button', { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => /true/.test(railsRun(`puts PromoGame.order(:created_at).last.active`)), "the game wasn't activated");
  await ctx.line("plays");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

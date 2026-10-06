/** Raffles, shot 1 of 3: switch raffles on and create one. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "raffles", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const [name, prize] = lang === "fr" ? ["Tirage du vendredi", "Carte-cadeau de 100 $"] : ["Friday Night Draw", "$100 gift card"];
  await ctx.pause(500);
  await ctx.line("on");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="operations"]', { settle: 900 });
  await ctx.reveal('label[for="store_settings_enable_raffles"], label[for="store_enable_raffles"]', { always: true });
  await ctx.click('label[for="store_settings_enable_raffles"], label[for="store_enable_raffles"]', { settle: 500 });
  await updateSettings(ctx);
  await ctx.line("new");
  await navClick(ctx, "/admin/raffles");
  await afterNav(ctx, { selector: 'main a[href="/admin/raffles/new"]' });
  await ctx.click('main a[href="/admin/raffles/new"]', { settle: 600 });
  await afterNav(ctx, { selector: 'input[name="raffle[name]"]' });
  await ctx.line("fill");
  await ctx.type('input[name="raffle[name]"]', name, { delay: 60, settle: 300 });
  await ctx.type('input[name="raffle[prize_description]"]', prize, { delay: 60, settle: 300 });
  await page.$eval('input[name="raffle[entry_price]"]', (e) => { e.value = ""; });
  await ctx.type('input[name="raffle[entry_price]"]', "2", { delay: 150, settle: 300 });
  await ctx.line("when");
  await ctx.select('select[name="raffle[draw_frequency]"]', "weekly", { settle: 400 });
  await ctx.select('select[name="raffle[draw_day_of_week]"]', await page.$eval('select[name="raffle[draw_day_of_week]"]', (s) => [...s.options].find((o) => /^(5|friday)$/i.test(o.value))?.value || s.options[s.options.length - 2].value), { settle: 400 });
  await ctx.click('form[action="/admin/raffles"] [type="submit"]', { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => /RAFFLE-/.test(railsRun(`puts Raffle.order(:created_at).last&.entry_product&.sku`)), "the raffle or its entry product wasn't created");
  await ctx.line("product");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

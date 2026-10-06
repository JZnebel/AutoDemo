/** Payment issues, shot 1 of 2: a payment button is missing — turn the payment type on. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "payment-issues", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  railsRun(`store.update!(payment_etransfer_enabled: false)`);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("missing");
  await ctx.pause(800);
  await ctx.line("settings");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="operations"]', { settle: 900 });
  await ctx.reveal('label[for="store_payment_etransfer_enabled"]', { always: true });
  await ctx.line("tick");
  await ctx.click('label[for="store_payment_etransfer_enabled"]', { settle: 600 });
  await updateSettings(ctx);
  await ctx.expect(async () => /true/.test(railsRun(`puts store.reload.payment_etransfer_enabled`)), "e-Transfer didn't switch on");
  await ctx.pause(800);
  await ctx.finishSpeaking();
}

/** Slot machine payouts, shot 1 of 3: switch payouts on and add the machines. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "casino-payouts", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

const box = (n) => `label[for="store_settings_${n}"], label[for="store_${n}"]`;

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("on");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="operations"]', { settle: 900 });
  await ctx.reveal(box("enable_payouts"), { always: true });
  await ctx.click(box("enable_payouts"), { settle: 400 });
  await ctx.click(box("enable_slot_machines"), { settle: 500 });
  await updateSettings(ctx);
  await ctx.line("machines");
  await navClick(ctx, "/reports");
  await afterNav(ctx, { selector: 'main a[href="/admin/gaming_machines"]' });
  await ctx.click('main a[href="/admin/gaming_machines"]', { settle: 600 });
  await afterNav(ctx, { selector: 'form[action="/admin/gaming_machines/bulk_create"]' });
  await ctx.line("bulk");
  await ctx.click('details:has(form[action="/admin/gaming_machines/bulk_create"]) > summary', { settle: 500 });
  await ctx.type('form[action="/admin/gaming_machines/bulk_create"] textarea[name="labels"]', "Slot 1\nSlot 2\nSlot 3", { delay: 70, settle: 400 });
  await ctx.click('form[action="/admin/gaming_machines/bulk_create"] [type="submit"]', { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts GamingMachine.count`).trim()) === 3, "the machines weren't added");
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}

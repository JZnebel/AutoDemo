/** Reservations, shot 1 of 2: booking a table in the back office. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { railsRun, isoDay } from "./_admin_common.mjs";

export const meta = { id: "reservations", seed: ["--open-drawer", "--restaurant"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await navClick(ctx, "/admin/reservations");
  await afterNav(ctx, { selector: 'main a[href="/admin/reservations/new"]' });
  await ctx.click('main a[href="/admin/reservations/new"]', { settle: 600 });
  await afterNav(ctx, { selector: 'input[name="reservation[customer_name]"]' });
  await ctx.line("who");
  await ctx.type('input[name="reservation[customer_name]"]', "Dana Whitfield", { delay: 60, settle: 300 });
  await ctx.type('input[name="reservation[phone]"]', "705-555-0164", { delay: 60, settle: 300 });
  await ctx.line("when");
  const table = await page.$eval('select[name="reservation[table_id]"]', (s) => [...s.options].find((o) => /\b6\b/.test(o.textContent))?.value || s.options[1]?.value);
  await ctx.select('select[name="reservation[table_id]"]', table, { settle: 300 });
  await page.$eval('input[name="reservation[date]"]', (e, v) => { e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); }, isoDay(1));
  await page.$eval('input[name="reservation[time]"]', (e) => { e.value = "19:00"; e.dispatchEvent(new Event("change", { bubbles: true })); });
  await ctx.pointAt('input[name="reservation[time]"]', { settle: 400 });
  await page.$eval('input[name="reservation[party_size]"]', (e) => { e.value = ""; });
  await ctx.type('input[name="reservation[party_size]"]', "4", { delay: 150, settle: 400 });
  await ctx.click('form[action="/admin/reservations"] [type="submit"]', { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => /Dana/.test(railsRun(`puts Reservation.order(:created_at).last&.customer_name`)), "the reservation wasn't saved");
  await ctx.line("register");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

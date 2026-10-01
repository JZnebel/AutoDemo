/** Settings -> Manage Users -> Add Staff Member. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";

export const meta = { id: "adding-staff", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/store_settings" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('main a[href="/users"]', { settle: 600 });
  await afterNav(ctx);

  await ctx.line("new");
  await ctx.click('main a[href="/users/new"]', { settle: 600 });
  await afterNav(ctx, { selector: 'form[action="/users"]' });

  await ctx.line("who");
  await ctx.type('[name="user[first_name]"]', "Jesse", { delay: 90, settle: 300 });
  await ctx.type('[name="user[last_name]"]', "Martin", { delay: 90, settle: 300 });
  await ctx.type('[name="user[email]"]', "jesse@riverstone.training", { delay: 50, settle: 400 });
  await ctx.select('[name="user[role]"]', "clerk", { settle: 800 });

  await ctx.line("pin");
  await ctx.type('[name="user[password]"]', "Welcome-2026", { delay: 60, settle: 200 });
  await ctx.type('[name="user[password_confirmation]"]', "Welcome-2026", { delay: 60, settle: 300 });
  await ctx.type('[name="user[pin]"]', "5813", { delay: 200, settle: 500 });

  await ctx.line("save");
  await ctx.click('form[action="/users"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

/** Cash Drawers -> Manage Registers -> Add Register. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "registers", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1600);
  await ctx.click('nav a[href="/cash_drawer_sessions"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/registers"]' });
  await ctx.click('main a[href="/registers"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/registers/new"]' });

  await ctx.line("add");
  await ctx.click('main a[href="/registers/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#register_name" });
  await ctx.type("#register_name", "Front Counter", { delay: 100, settle: 300 });
  await ctx.type("#register_identifier", "pos-002", { delay: 130, settle: 600 });

  await ctx.line("float");
  await ctx.type("#register_default_opening_float", "200", { delay: 200, settle: 600 });
  await ctx.pointAt("#register_default_close_mode", { settle: 1500 });

  await ctx.line("create");
  await ctx.click('form[action="/registers"] input[type="submit"]', { settle: 500 });
  await afterNav(ctx);
  const ok = await page.evaluate(async () => /Front Counter/.test(await (await fetch("/registers", { headers: { Accept: "text/html" } })).text()));
  if (!ok) throw new Error("the register wasn't created");
  await ctx.pause(1000);

  await ctx.line("pick");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

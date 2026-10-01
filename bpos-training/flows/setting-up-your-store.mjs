/** The first-run setup wizard, start to finish. The store is seeded un-set-up. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";

export const meta = { id: "setting-up-your-store", seed: ["--setup-wizard"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/admin/setup/basics" }); }

const next = async (ctx, tag) => {
  await ctx.click(await byText(ctx.page, A("Save & continue →"), "main button, main input[type=submit]", tag), { settle: 500 });
  await afterNav(ctx);
};

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("intro");
  await ctx.pause(4500);

  await ctx.line("basics");
  await ctx.pointAt('select[name="store_type"]', { settle: 900 });
  await ctx.pointAt('select[name="timezone"]', { settle: 1300 });
  await ctx.pointAt('input[name="tax_rate"]', { settle: 1800 });
  await next(ctx, "n1");

  await ctx.line("hardware");
  await ctx.click('label:has(input[name="register_platform"][value="windows"])', { settle: 900 });
  await ctx.click('label:has(input[name="receipt_printer"])', { settle: 500 });
  await ctx.click('label:has(input[name="barcode_scanner"])', { settle: 900 });
  await next(ctx, "n2");

  await ctx.line("registers");
  await ctx.type('input[name="registers[][name]"]', "Front Counter", { delay: 90, settle: 700 });
  await next(ctx, "n3");

  await ctx.line("features");
  await ctx.click('label:has(input[name="enable_time_tracking"])', { settle: 900 });
  await next(ctx, "n4");

  await ctx.line("payments");
  await ctx.pointAt('label:has(input[name="payment_cash"])', { settle: 700 });
  await ctx.pointAt('label:has(input[name="payment_debit"])', { settle: 900 });
  await next(ctx, "n5");

  await ctx.line("skip");
  for (const tag of ["s1", "s2"]) {
    await ctx.click(await byText(page, A("Skip this step"), "main a, main button", tag), { settle: 500 });
    await afterNav(ctx);
  }

  await ctx.line("staff");
  await ctx.type('input[name="staff[0][first_name]"]', "Jesse", { delay: 80, settle: 200 });
  await ctx.type('input[name="staff[0][last_name]"]', "Martin", { delay: 80, settle: 200 });
  await ctx.type('input[name="staff[0][email]"]', "jesse@riverstone.training", { delay: 45, settle: 200 });
  await ctx.type('input[name="staff[0][pin]"]', "5813", { delay: 160, settle: 200 });
  await ctx.select('select[name="staff[0][role]"]', "clerk", { settle: 700 });
  await next(ctx, "n6");

  await ctx.line("done");
  await ctx.pause(800);
  await ctx.click(await byText(page, A("Finish setup & go to the admin"), "main a, main button, main input[type=submit]", "finish"), { settle: 500 });
  await afterNav(ctx);
  if (!/\/admin\/?$/.test(new URL(page.url()).pathname)) throw new Error(`wizard didn't finish: ${page.url()}`);
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}

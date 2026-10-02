/** A return from the back office: the order -> Process Return -> Complete Return. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { ringSomeSales, newestOrderPath } from "./_admin_common.mjs";

export const meta = { id: "returns-admin", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await ringSomeSales(ctx);
  await openAdmin(ctx, { path: "/orders" });
  await goAdmin(ctx, await newestOrderPath(ctx.page, "cash"));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2500);
  await ctx.click('main a[href^="/admin/returns/new"]', { settle: 500 });
  await afterNav(ctx, { selector: 'form[action="/admin/returns"]' });

  await ctx.line("items");
  const qty = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('form[action="/admin/returns"] input[type="number"][name$="[quantity]"]')].filter((x) => x.offsetParent);
    inputs[0]?.setAttribute("data-rec", "qty");
    return inputs.length;
  });
  if (!qty) throw new Error("no Return Qty fields");
  await ctx.pointAt('[data-rec="qty"]', { settle: 1800 });

  await ctx.line("refund");
  await ctx.pointAt("#return_refund_method", { settle: 1500 });
  await ctx.pointAt("#return_restock_items", { settle: 1500 });

  await ctx.line("process");
  await ctx.click('form[action="/admin/returns"] input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx, { selector: 'form[action$="/complete"] button, form[action$="/complete"] input[type="submit"]' });
  await ctx.pause(1500);
  // The "Return created" message sits over the Complete Return button; let it go first.
  await page.evaluate(() => document.querySelectorAll('[data-controller~="flash"], .flash, [role="alert"], [role="status"]').forEach((e) => e.remove()));

  await ctx.line("complete");
  await ctx.click('form[action$="/complete"] button, form[action$="/complete"] input[type="submit"]', { settle: 1000 });
  await ctx.click("#confirmation-modal-confirm-btn", { settle: 500 });
  await afterNav(ctx);
  const done = await page.evaluate(() => !document.querySelector('form[action$="/complete"]'));
  if (!done) throw new Error("the return wasn't completed");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

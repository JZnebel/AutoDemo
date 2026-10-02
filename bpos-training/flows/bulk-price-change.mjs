/** More Actions -> Bulk Operations: put every pre-roll up a dollar in one go. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "bulk-price-change", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2600);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/bulk_operations"]', { settle: 500 });
  await afterNav(ctx, { selector: "#bulk-search" });

  await ctx.line("pick");
  await ctx.type("#bulk-search", "pre-roll", { delay: 120, settle: 800 });
  await ctx.click("#bulk-select-shown", { settle: 900 });

  await ctx.line("price");
  await ctx.click('.bulk-tab[data-tab="price"]', { settle: 700 });
  await ctx.select("#price-operation", "add", { settle: 700 });
  await ctx.type("#price-value", "1", { delay: 200, settle: 600 });

  await ctx.line("update");
  await ctx.click("#bulk-price-update", { settle: 1200 });
  await ctx.pointAt("#bulk-modal-message", { settle: 1500 });
  await ctx.click("#bulk-modal-confirm", { settle: 2000 });

  await ctx.line("done");
  const prices = await page.evaluate(async () => {
    const html = await (await fetch("/products?search=House+Pre-Roll", { headers: { Accept: "text/html" } })).text();
    const text = new DOMParser().parseFromString(html, "text/html").body.innerText || new DOMParser().parseFromString(html, "text/html").body.textContent;
    return /10[.,]00/.test(text);
  });
  if (!prices) throw new Error("the price didn't go up");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

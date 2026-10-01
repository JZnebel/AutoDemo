/** Reports -> Daily Close. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";
import { ringSomeSales } from "./_admin_common.mjs";

export const meta = { id: "daily-close", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await ringSomeSales(ctx);
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  const card = await page.evaluate((w) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const h = [...document.querySelectorAll("main h2, main h3, main p, main span")].find((e) => w.includes(norm(e.innerText)));
    const a = h?.closest("a");
    a?.setAttribute("data-rec", "close-card");
    return !!a;
  }, A("Daily Close"));
  if (!card) throw new Error("no Daily Close card");
  await ctx.click('[data-rec="close-card"]', { settle: 600 });
  await afterNav(ctx);

  await ctx.line("summary");
  await ctx.pause(2000);
  await page.evaluate(() => [...document.querySelectorAll("main h2, main h3")].forEach((h, i) => h.setAttribute("data-rec", `sec-${i}`)));
  // Payment summary first, then on down to the cash drawers.
  await ctx.reveal('[data-rec="sec-1"]', { block: 0.08, always: true });
  await ctx.pause(1500);
  if (await page.$('[data-rec="sec-5"]')) await ctx.reveal('[data-rec="sec-5"]', { block: 0.08, always: true });
  await ctx.pause(2500);

  await ctx.line("print");
  const btn = await page.evaluate((w) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const b = [...document.querySelectorAll("main a, main button")].find((e) => w.some((x) => norm(e.innerText).startsWith(x)) && e.getBoundingClientRect().width > 0);
    b?.setAttribute("data-rec", "print");
    return !!b;
  }, [...A("Print"), ...A("Export PDF")]);
  if (btn) await ctx.pointAt('[data-rec="print"]', { settle: 1500 });
  await ctx.finishSpeaking();
}

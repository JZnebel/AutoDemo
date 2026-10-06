/** Table service at the register: seat a table, add to its tab, send to the kitchen, pay, clear. */
import { openRegister, byTextStart, topmost, productCard, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "table-service", seed: ["--open-drawer", "--restaurant"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "manager" }); }

/** The table tile whose number is `n` (its first line of text). */
async function tile(page, n) {
  const ok = await page.evaluate((num) => {
    const b = [...document.querySelectorAll("button")].find((e) => e.offsetParent && (e.innerText || "").split("\n").map((l) => l.trim()).includes(num) && e.getBoundingClientRect().width > 50);
    document.querySelectorAll('[data-rec="tile"]').forEach((x) => x.removeAttribute("data-rec"));
    b?.setAttribute("data-rec", "tile");
    return !!b;
  }, String(n));
  if (!ok) throw new Error(`no table ${n}`);
  return '[data-rec="tile"]';
}
const status = () => railsRun(`puts Table.find_by(number: "4").status`).trim().split("\n").pop();

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const fries = lang === "fr" ? "Frites" : "Fries";
  await ctx.pause(500);
  await ctx.line("tables");
  await ctx.click(await byTextStart(page, L("Tables"), "button", "tables-tab"), { settle: 1200 });
  await ctx.line("seat");
  await ctx.click(await tile(page, 4), { settle: 900 });
  const covers = await page.$('input[type="number"]');
  if (covers) { await page.$eval('input[type="number"]', (e) => { e.value = ""; }); await ctx.type('input[type="number"]', "3", { delay: 150, settle: 300 }); }
  await ctx.click(await topmost(page, L("Seat Table"), "seat"), { settle: 1200 });
  await ctx.expect(async () => status() === "occupied", "the table wasn't seated");
  await ctx.line("add");
  await ctx.click(await tile(page, 4), { settle: 900 });
  await ctx.click(await topmost(page, L("View Tab"), "view"), { settle: 900 });
  await ctx.click(await topmost(page, L("Add Item"), "additem"), { settle: 900 });
  for (const n of ["Bannock Burger", fries, "Indian Taco"]) await ctx.click((await productCard(page, n)).sel, { settle: 700 });
  await ctx.click(await topmost(page, L("Done Adding"), "done"), { settle: 900 });
  await ctx.line("send");
  await ctx.click(await byTextStart(page, L("Tables"), "button", "tables-tab"), { settle: 1000 });
  await ctx.click(await tile(page, 4), { settle: 900 });
  await ctx.click(await topmost(page, L("View Tab"), "view2"), { settle: 900 });
  await ctx.click(await byTextStart(page, L("Send"), "button", "send"), { settle: 1200 });
  await ctx.line("pay");
  await ctx.click(await topmost(page, L("Close Tab"), "closetab"), { settle: 900 });
  await ctx.click(await topmost(page, L("Close & Pay"), "closepay"), { settle: 1200 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 800 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 500 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 1800 });
  await ctx.click(await topmost(page, L("Start New Sale"), "newsale"), { settle: 1000 });
  await ctx.line("clear");
  await ctx.expect(async () => status() === "dirty", "the paid table didn't turn to be cleaned", 20000);
  await ctx.click(await byTextStart(page, L("Tables"), "button", "tables-tab"), { settle: 1000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.querySelector("svg.lucide-refresh-cw"))?.click());
  await ctx.pause(1200);
  await ctx.click(await tile(page, 4), { settle: 900 });
  await ctx.click(await topmost(page, L("Mark Available"), "avail"), { settle: 1200 });
  await ctx.expect(async () => status() === "available", "the table wasn't cleared");
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}

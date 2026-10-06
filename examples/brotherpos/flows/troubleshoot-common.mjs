/** Common issues: an old price (Sync Now), a printer that won't print (Test Print), a lost PIN. */
import { openRegister, topmost, productCard, once, L } from "../register.mjs";
import { ensurePrinters, printedBytes, RECEIPT_OUT } from "../printers.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "troubleshoot-common", seed: ["--open-drawer", "--receipt-printing"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await ensurePrinters();
  railsRun(`Register.order(:id).first.update!(printer_enabled: true, printer_ip: "localhost", printer_port: 9100, receipt_printer_type: "escpos")`);
  await openRegister(ctx, { lang, who: "manager" });
  // A price changed in the back office after this register loaded its catalogue.
  railsRun(`Product.find_by!(sku: "DEMO-PR-001").update!(price: 10)`);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("price");
  const { sel } = await productCard(page, "House Pre-Roll 1g");
  await ctx.pointAt(sel, { settle: 1200 });
  await ctx.line("sync");
  await ctx.click('[data-tour="sync-status"]', { settle: 1000 });
  const syncNow = await once(() => topmost(page, L("Sync Now"), "sync-now")).catch(() => null);
  if (!syncNow) throw new Error("no Sync Now");
  await ctx.click(syncNow, { settle: 2500 });
  await page.keyboard.press("Escape").catch(() => {});
  await ctx.expect(() => page.evaluate(() => {
    const card = [...document.querySelectorAll("[data-product-id]")].find((c) => /House Pre-Roll 1g/.test(c.innerText));
    return /10[.,]00/.test(card?.innerText || "");
  }), "the new price didn't come through", 20000);
  await ctx.pointAt(sel, { settle: 1200 });

  await ctx.line("printer");
  await ctx.pause(1500);
  await ctx.click('[data-tour="settings-btn"]', { settle: 1300 });
  const open = () => page.evaluate((w) => [...document.querySelectorAll("button")].some((b) => b.offsetParent && w.includes(b.innerText.replace(/\s+/g, " ").trim())), L("Test Print"));
  if (!(await open())) await ctx.click('[data-tour="settings-btn"]', { settle: 1300 });
  await ctx.line("test");
  const before = printedBytes(RECEIPT_OUT);
  await ctx.click(await topmost(page, L("Test Print"), "test"), { settle: 2500 });
  await ctx.expect(async () => printedBytes(RECEIPT_OUT) > before, "the test print didn't come out");
  await ctx.click(await topmost(page, L("Cancel"), "close"), { settle: 900 });

  await ctx.line("pin");
  await ctx.pointAt('[data-tour="lock-btn"]', { settle: 1500 });
  await ctx.line("stuck");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

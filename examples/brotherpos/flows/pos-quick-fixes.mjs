/** Register quick fixes: an item that isn't in the system, holding a sale, reprinting a receipt. */
import { openRegister, byText, byTextStart, topmost, latestSaleRow, L } from "../register.mjs";
import { ensurePrinters, printedBytes, RECEIPT_OUT } from "../printers.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "pos-quick-fixes", seed: ["--open-drawer", "--receipt-printing"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await ensurePrinters();
  railsRun(`Register.order(:id).first.update!(printer_enabled: true, printer_ip: "localhost", printer_port: 9100, receipt_printer_type: "escpos", auto_print_receipts: false)`);
  await openRegister(ctx, { lang, who: "manager" });
}

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const [item, reason, who] = lang === "fr" ? ["Briquet", "Pas dans le catalogue", "Jamie"] : ["Lighter", "Not in the catalogue", "Jamie"];
  await ctx.pause(500);
  await ctx.line("manual");
  await ctx.click(await topmost(page, L("Manual Item"), "manual"), { settle: 800 });
  await ctx.type("#manual-item-name", item, { delay: 80, settle: 300 });
  await ctx.type("#manual-item-price", "4", { delay: 150, settle: 300 });
  if (await page.$("#manual-item-reason")) await ctx.type("#manual-item-reason", reason, { delay: 50, settle: 400 });
  await ctx.click(await byText(page, L("Add to Cart"), '[data-tour="manual-item-modal"] button', "add"), { settle: 900 });
  await ctx.expect(() => page.evaluate((n) => (document.querySelector('[data-tour="cart-pane"]')?.innerText || "").includes(n), item), "the manual item isn't in the cart");

  await ctx.line("hold");
  await ctx.click('[data-tour="hold-btn"]', { settle: 800 });
  await ctx.type('[role="dialog"] input[type="text"], [aria-labelledby="hold-modal-title"] input', who, { delay: 90, settle: 400 });
  await ctx.click(await byText(page, L("Hold Order"), '[aria-labelledby="hold-modal-title"] button', "hold-ok"), { settle: 1200 });
  await ctx.line("recall");
  await ctx.click(await topmost(page, L("Recall"), "recall"), { settle: 1000 });
  await ctx.click(await byTextStart(page, [who], '[role="dialog"] button, [role="dialog"] li, [role="dialog"] [class*=cursor-pointer]', "held"), { settle: 700 });
  await ctx.click(await byText(page, L("Recall Order"), '[role="dialog"] button', "recall-ok"), { settle: 1200 });
  await ctx.expect(() => page.evaluate((n) => (document.querySelector('[data-tour="cart-pane"]')?.innerText || "").includes(n), item), "the held sale didn't come back");

  await ctx.line("pay");
  await ctx.click('[data-tour="tender-cash"]', { settle: 800 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 500 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 1800 });
  await ctx.click(await byText(page, L("Start New Sale"), "button", "newsale"), { settle: 1000 });

  await ctx.line("reprint");
  const before = printedBytes(RECEIPT_OUT);
  await ctx.click(await latestSaleRow(page), { settle: 1200 });
  await ctx.click(await topmost(page, L("Print"), "print"), { settle: 2500 });
  await ctx.expect(async () => printedBytes(RECEIPT_OUT) > before, "the receipt didn't reprint");
  await ctx.line("offline");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

/** Cash drawer: it opens off the receipt printer. Turn on printing, ring a cash sale, it pops. */
import { readFileSync, existsSync } from "fs";
import { openRegister, byText, topmost, productCard, L } from "../register.mjs";
import { ensurePrinters, RECEIPT_OUT } from "../printers.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "cash-drawer", seed: ["--open-drawer", "--receipt-printing"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await ensurePrinters();
  // The receipt printer is already set up (that's its own clip); printing after sales is off.
  railsRun(`Register.order(:id).first.update!(printer_enabled: true, printer_ip: "localhost", printer_port: 9100, receipt_printer_type: "escpos", auto_print_receipts: false, open_drawer_only: false)`);
  await openRegister(ctx, { lang, who: "manager" });
}

// ESC p — the pulse a receipt printer sends out of its DK port to open the drawer.
const kicks = () => {
  if (!existsSync(RECEIPT_OUT)) return 0;
  const b = readFileSync(RECEIPT_OUT);
  let n = 0;
  for (let i = 0; i + 1 < b.length; i++) if (b[i] === 0x1b && b[i + 1] === 0x70) n++;
  return n;
};

export async function run(ctx) {
  const { page } = ctx;
  const before = kicks();
  await ctx.pause(500);
  await ctx.line("cable");
  await ctx.pause(3500);
  await ctx.line("settings");
  await ctx.click('[data-tour="settings-btn"]', { settle: 1300 });
  await ctx.reveal("#print-receipts", { always: true });
  await ctx.line("option");
  if (!(await page.$eval("#print-receipts", (e) => e.checked))) await ctx.click("#print-receipts", { settle: 700 });
  await ctx.pointAt("#drawer-only", { settle: 1200 });
  await ctx.click(await topmost(page, L("Save Settings"), "save"), { settle: 1800 });
  await ctx.line("sale");
  const { sel } = await productCard(page, "House Pre-Roll 1g");
  await ctx.click(sel, { settle: 700 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 900 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 600 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 2500 });
  await ctx.expect(async () => kicks() > before, "the drawer wasn't kicked");
  await ctx.line("pops");
  await ctx.click(await byText(page, L("Start New Sale"), "button", "newsale"), { settle: 900 });
  await ctx.line("button");
  const mid = kicks();
  await ctx.click('[data-tour="cash-drawer-btn"]', { settle: 1500 });
  await ctx.expect(async () => kicks() > mid, "the drawer button didn't kick it");
  await ctx.line("voltage");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

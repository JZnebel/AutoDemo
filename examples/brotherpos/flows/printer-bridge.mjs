/** The Printer Bridge: download it from the register's page, run it, Check Again, Test Print. */
import { execSync } from "child_process";
import { openAdmin, afterNav } from "../admin.mjs";
import { ensurePrinters, printedBytes, RECEIPT_OUT } from "../printers.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "printer-bridge", seed: ["--receipt-printing"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  // The clip starts before the bridge is installed: stop it, so the page offers the download.
  try { execSync("pkill -f '[l]inux_printer_bridge.py'"); } catch {}
  await openAdmin(ctx, { path: "/products" });
}

const W = '[data-printer-wizard-printer-type-value="receipt"]';

export async function run(ctx) {
  const { page } = ctx;
  const reg = railsRun(`puts Register.order(:id).first.id`).trim();
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(400);
  await ctx.line("open");
  await ctx.click('nav a[href="/cash_drawer_sessions"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/registers"]' });
  await ctx.click('main a[href="/registers"]', { settle: 500 });
  await afterNav(ctx, { selector: `main a[href="/registers/${reg}/edit"]` });
  await ctx.click(`main a[href="/registers/${reg}/edit"]`, { settle: 500 });
  await afterNav(ctx, { selector: `${W} [data-printer-wizard-target="bridgeStatus"]` });
  await ctx.reveal(`${W} [data-printer-wizard-target="bridgeStatus"]`, { always: true });
  await ctx.line("download");
  await ctx.pointAt(`${W} a[href="/downloads/PrinterBridge.exe"]`, { settle: 1500 });
  await ctx.line("run");
  await ensurePrinters();
  await ctx.pause(2500);
  await ctx.line("check");
  await ctx.click(`${W} [data-printer-wizard-target="bridgeCheckBtn"]`, { settle: 2500 });
  await ctx.expect(() => page.$eval(`${W} [data-printer-wizard-target="bridgeStatus"]`, (e) => !/amber/.test(e.className)), "the bridge wasn't found");
  await ctx.line("test");
  const before = printedBytes(RECEIPT_OUT);
  await ctx.click(`${W} [data-printer-wizard-target="testButton"]`, { settle: 3000 });
  await ctx.expect(async () => printedBytes(RECEIPT_OUT) > before, "the test print didn't come out");
  await ctx.line("save");
  await ctx.click(`form[action="/registers/${reg}"] input[type="submit"], form[action="/registers/${reg}"] button[type="submit"]`, { settle: 800 });
  await afterNav(ctx);
  await ctx.line("ipad");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

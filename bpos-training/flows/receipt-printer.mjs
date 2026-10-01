/** Register Settings -> Enable receipt printer -> auto-detect the bridge -> Test Print. */
import { openRegister, byText, topmost, L } from "../register.mjs";
import { ensurePrinters, printedBytes, RECEIPT_OUT } from "../printers.mjs";

export const meta = { id: "receipt-printer", seed: ["--open-drawer", "--receipt-printing"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await ensurePrinters();
  await openRegister(ctx, { lang, who: "manager" });
}

export async function run(ctx) {
  const { page } = ctx;
  const before = printedBytes(RECEIPT_OUT);
  await ctx.pause(500);
  await ctx.line("bridge");
  await ctx.pause(5000);

  await ctx.line("settings");
  await ctx.pause(600);
  await ctx.click('[data-tour="settings-btn"]', { settle: 1300 });

  await ctx.line("enable");
  // On by default once the store has receipt printing; tick it only if it isn't.
  if (await page.$eval("#receipt-printer-enabled", (e) => e.checked)) await ctx.pointAt("#receipt-printer-enabled", { settle: 900 });
  else await ctx.click("#receipt-printer-enabled", { settle: 900 });
  await ctx.click(await topmost(page, L("Auto-Detect"), "detect"), { settle: 3500 });
  const found = L("Found printer bridge running locally!");
  if (!(await page.evaluate((w) => w.some((x) => document.body.innerText.includes(x)), found))) throw new Error("bridge not found");

  await ctx.line("test");
  await ctx.click(await topmost(page, L("Test Print"), "test"), { settle: 3000 });
  if (printedBytes(RECEIPT_OUT) <= before) throw new Error("the test print didn't reach the printer");
  await ctx.click(await topmost(page, L("Save Settings"), "save"), { settle: 1800 });

  await ctx.line("note");
  await ctx.pause(4000);
  await ctx.finishSpeaking();
}

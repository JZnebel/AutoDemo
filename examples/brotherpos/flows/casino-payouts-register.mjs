/** Slot machine payouts, shot 2 of 3: paying a machine out at the register. */
import { openRegister, byTextStart, topmost, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "casino-payouts-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "manager" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("drop");
  await ctx.click('[data-tour="cash-drop-btn"]', { settle: 900 });
  await ctx.line("reason");
  await ctx.click(await byTextStart(page, L("Machine Payout"), "button", "slot"), { settle: 700 });
  const machine = await page.evaluate(() => {
    const s = [...document.querySelectorAll('[role="dialog"] select, select')].find((x) => x.offsetParent);
    s?.setAttribute("data-rec", "machine");
    return [...(s?.options || [])].find((o) => /2/.test(o.textContent))?.value;
  });
  await ctx.select('[data-rec="machine"]', machine, { settle: 500 });
  await ctx.line("amount");
  await page.keyboard.type("120", { delay: 220 });
  await ctx.pause(600);
  await ctx.click(await topmost(page, L("Record Pay Out"), "record"), { settle: 1500 });
  await ctx.expect(async () => /slot_payout/.test(railsRun(`puts CashDrop.order(:created_at).last&.reason`)), "the payout wasn't recorded");
  await ctx.line("drawer");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

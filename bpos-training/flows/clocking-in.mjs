/** The register's time clock: PIN, Clock In; later, Clock Out. */
import { openRegister, topmost, L } from "../register.mjs";
import { creds } from "../config.mjs";
import { sleep } from "../recorder.mjs";

export const meta = { id: "clocking-in", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

/** The PIN pad inside the time clock window (the topmost digit buttons). */
async function pin(ctx, code) {
  for (const d of code) await ctx.click(await topmost(ctx.page, [d], `tc-${d}`), { settle: 230 });
}

export async function run(ctx) {
  const { page } = ctx;
  const p = creds().clerkPin;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('[data-tour="time-clock-btn"]', { settle: 1300 });

  await ctx.line("pin");
  await ctx.pause(400);
  await pin(ctx, p);
  await sleep(1000);
  await ctx.click(await topmost(page, L("Clock In"), "in"), { settle: 2200 });
  if (!(await page.evaluate(() => /clocked in|a pointé|arrivée/i.test(document.body.innerText)))) throw new Error("didn't clock in");

  await ctx.line("out");
  await ctx.pause(800);
  await pin(ctx, p);
  await sleep(1000);
  await ctx.click(await topmost(page, L("Clock Out"), "out"), { settle: 2200 });

  await ctx.line("hours");
  await ctx.pause(3000);
  await ctx.finishSpeaking();
}

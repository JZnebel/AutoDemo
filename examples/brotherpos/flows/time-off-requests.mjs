/** Time off: Riley asks at the register's time clock; the manager approves it in the back
 *  office, taking the shifts it clashes with off the schedule. */
import { topmost, L } from "../register.mjs";
import { BASE, creds } from "../config.mjs";
import { afterNav } from "../admin.mjs";
import { adminThenRegister, setDate, isoDay } from "./_admin_common.mjs";

export const meta = { id: "time-off-requests", seed: ["--open-drawer", "--shifts"], viewport: { width: 1600, height: 900 } };

const REASON = { en: "Family wedding", fr: "Mariage dans la famille" };
let reason = REASON.en;

export async function setup(ctx, { lang }) {
  reason = REASON[lang] || REASON.en;
  await adminThenRegister(ctx, { lang, who: null });
}

async function pin(ctx, code) {
  for (const d of code) await ctx.click(await topmost(ctx.page, [d], `tc-${d}`), { settle: 230 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click(await topmost(page, L("Time Clock"), "clock"), { settle: 1000 });
  await pin(ctx, creds().clerkPin);

  await ctx.line("form");
  await ctx.click(await topmost(page, L("Request Time Off"), "req"), { settle: 900 });
  const dates = await page.$$('input[type="date"]');
  if (dates.length < 2) throw new Error("no From/To dates");
  await page.$$eval('input[type="date"]', (els) => els.forEach((e, i) => e.setAttribute("data-rec", `d${i}`)));
  await setDate(ctx, '[data-rec="d0"]', isoDay(3));
  await setDate(ctx, '[data-rec="d1"]', isoDay(4));
  const r = await page.evaluate(() => {
    const i = [...document.querySelectorAll('input[type="text"], textarea')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    i?.setAttribute("data-rec", "reason");
    return !!i;
  });
  if (r) await ctx.type('[data-rec="reason"]', reason, { delay: 70, settle: 400 });

  await ctx.line("send");
  await ctx.click(await topmost(page, L("Send Request"), "send"), { settle: 1200 });
  await ctx.expect(() => page.evaluate(() => !!document.querySelector('[role="status"], ul[aria-label]')), "the request wasn't sent");
  await ctx.pause(1500);

  await ctx.line("manager");
  await ctx.goto(`${BASE}/admin/shifts`);
  await afterNav(ctx, { selector: 'main a[href="/admin/time_off_requests"]' });
  await ctx.click('main a[href="/admin/time_off_requests"]', { settle: 500 });
  await afterNav(ctx, { selector: 'form[action$="/approve"]' });

  await ctx.line("approve");
  await ctx.pointAt('input[id^="remove_conflicts_"]', { settle: 1200 }).catch(() => {});
  await ctx.click('form[action$="/approve"] [type="submit"]', { settle: 800 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !document.querySelector('form[action$="/approve"]')), "the request wasn't approved");

  await ctx.line("after");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

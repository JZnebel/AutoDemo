/** Wholesale pairing, shot 1 of 3 — the distributor makes a pairing code. */
import { afterNav } from "../admin.mjs";
import { DIST, signInTo, shared } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-pairing", seed: ["--wholesale"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) { await signInTo(ctx, DIST, "/admin/retailer_connections"); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("intro");
  await ctx.pause(800);
  await ctx.line("codes");
  await ctx.click('main a[href="/admin/pairing_codes"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/pairing_codes/new"]' });
  await ctx.click('main a[href="/admin/pairing_codes/new"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="pairing_code[label]"]' });
  await ctx.line("label");
  await ctx.type('input[name="pairing_code[label]"]', "Riverstone Cannabis", { delay: 70, settle: 400 });
  await ctx.select('select[name="pairing_code[expires_in_hours]"]', await page.$eval('select[name="pairing_code[expires_in_hours]"]', (s) => [...s.options].map((o) => o.value).find((v) => Number(v) >= 72) || s.value), { settle: 400 });
  await ctx.click('form[action="/admin/pairing_codes"] [type="submit"]', { settle: 700 });
  await afterNav(ctx);
  const code = railsRun(`puts PairingCode.order(:created_at).last&.code`, { SUB: DIST.sub }).trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`no pairing code made (${code})`);
  shared.code = code;
  await ctx.expect(() => page.evaluate((c) => document.body.innerText.includes(c), code), "the code isn't on the page");
  await ctx.line("share");
  await ctx.pointAt(await page.evaluate((c) => {
    const el = [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.textContent.trim() === c)[0];
    el?.setAttribute("data-rec", "code");
    return el ? '[data-rec="code"]' : "main h1";
  }, code), { settle: 2500 });
  await ctx.finishSpeaking();
}

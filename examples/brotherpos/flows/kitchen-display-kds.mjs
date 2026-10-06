/** Kitchen display, shot 3 of 3: the kitchen screen — Start, Ready, Picked Up. */
import { byText, L } from "../register.mjs";
import { BASE, creds } from "../config.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "kitchen-display-kds", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  const { page } = ctx;
  await page.goto(`${BASE}/kds`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"], input[inputmode="numeric"]', { timeout: 30000 });
  if (await page.$('input[type="email"]')) {
    await page.type('input[type="email"]', `owner@${new URL(BASE).hostname.split(".")[0].replace(/\d+$/, "")}.training`);
    await page.type('input[type="password"]', creds().password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[inputmode="numeric"]', { timeout: 20000 });
  }
  await page.focus('input[inputmode="numeric"]');
  await page.keyboard.type(creds().ownerPin, { delay: 120 });
  await page.waitForFunction((w) => w.some((x) => document.body.innerText.includes(x)), { timeout: 30000 }, L("Start"));
}

const status = () => railsRun(`puts Sale.order(:created_at).last.kitchen_status`).trim().split("\n").pop();

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("screen");
  await ctx.pause(1500);
  await ctx.line("start");
  await ctx.click(await byText(page, L("Start"), "button", "start"), { settle: 1200 });
  await ctx.expect(async () => status() === "preparing", "the order didn't start");
  await ctx.line("ready");
  await ctx.click(await byText(page, L("Ready"), "button", "ready"), { settle: 1200 });
  await ctx.line("picked");
  await ctx.click(await byText(page, L("Picked Up"), "button", "picked"), { settle: 1500 });
  await ctx.expect(async () => status() === "picked_up", "the order wasn't picked up");
  await ctx.line("tablet");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

/** Settings -> Sales & Integrations -> Customer-Facing Display: switch it on, open the
 *  register's display link, and watch a sale appear on it. The register runs in a second,
 *  unfilmed tab signed in with the clerk's PIN; the display follows it through the server. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { BASE, creds } from "../config.mjs";
import { sleep } from "autodemo/recorder";

export const meta = { id: "customer-display", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

let till;
export async function setup(ctx, { lang }) {
  await openAdmin(ctx, { path: "/products" });
  // The till, off camera. Not openRegister(): that wipes the origin's storage and cookies,
  // which would sign the filmed back office out.
  till = await ctx.page.browser().newPage();
  await till.setViewport({ width: 1600, height: 900 });
  await till.goto(`${BASE}/pos/`, { waitUntil: "domcontentloaded" });
  await till.evaluate((l) => localStorage.setItem("pos-locale", l), lang);
  await till.reload({ waitUntil: "domcontentloaded" });
  await till.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "5"), { timeout: 30000 });
  for (const d of creds().clerkPin) {
    await till.evaluate((digit) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === digit)?.click(), d);
    await sleep(180);
  }
  await till.waitForSelector("[data-product-id]", { timeout: 30000 });
  await ctx.page.bringToFront();
}

async function tillAdd(name) {
  await till.evaluate((n) => {
    const el = [...document.querySelectorAll('[data-tour="product-grid"] [data-product-id]')].find((e) => e.innerText.split("\n").some((l) => l.trim() === n));
    el?.click();
  }, name);
  await sleep(1200);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await openEditSettings(ctx);
  await ctx.click('.settings-tab[data-tab="integrations"]', { settle: 1000 });

  await ctx.line("enable");
  await ctx.reveal("#store_enable_customer_display");
  if (!(await page.$eval("#store_enable_customer_display", (c) => c.checked))) await ctx.click("#store_enable_customer_display", { settle: 800 });
  await updateSettings(ctx);
  await goAdmin(ctx, "/store_settings/edit");
  await ctx.click('.settings-tab[data-tab="integrations"]', { settle: 800 });

  await ctx.line("link");
  const url = await page.evaluate(() => document.querySelector('code[id^="customer-display-url"]')?.textContent.trim());
  if (!url) throw new Error("no customer display link");
  await ctx.pointAt('code[id^="customer-display-url"]', { settle: 2500 });

  await ctx.line("screen");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await afterNav(ctx);
  await ctx.pause(2500);

  await ctx.line("sale");
  await tillAdd("Mango Gummies 10mg x 10");
  await tillAdd("House Pre-Roll 1g");
  await page.waitForFunction(() => /Mango Gummies/.test(document.body.innerText), { timeout: 15000 });
  await ctx.pause(3000);

  await ctx.line("idle");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
  await till.close().catch(() => {});
}

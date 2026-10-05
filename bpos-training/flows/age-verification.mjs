/** Turning on ID checks: Settings -> Tax & Compliance -> Age Verification, then mark Flower as
 *  age restricted, then what the cashier sees at the register. */
import { goAdmin, afterNav } from "../admin.mjs";
import { productCard, topmost, L } from "../register.mjs";
import { adminThenRegister } from "./_admin_common.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "age-verification", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await adminThenRegister(ctx, { lang });
  await goAdmin(ctx, "/products");
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await openEditSettings(ctx);
  await ctx.click('.settings-tab[data-tab="tax"]', { settle: 1000 });

  await ctx.line("enable");
  await ctx.reveal("#store_enable_age_verification");
  if (!(await page.$eval("#store_enable_age_verification", (c) => c.checked))) await ctx.click("#store_enable_age_verification", { settle: 600 });
  await ctx.type("#store_minimum_age", "19", { delay: 200, settle: 600 });

  await ctx.line("mode");
  await ctx.pointAt("#store_age_verification_mode", { settle: 1800 });
  await updateSettings(ctx);

  await ctx.line("category");
  await goAdmin(ctx, "/categories");
  const edit = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr")].find((r) => /^\s*Flower\b/.test(r.innerText) && r.querySelector('a[href$="/edit"]'));
    const a = row?.querySelector('a[href$="/edit"]');
    a?.setAttribute("data-rec", "edit-flower");
    return !!a;
  });
  if (!edit) throw new Error("no Edit for Flower");
  await ctx.click('[data-rec="edit-flower"]', { settle: 500 });
  await page.waitForSelector("#category_age_restricted", { timeout: 15000 });
  await ctx.settle();
  await ctx.click('label[for="category_age_restricted"]', { settle: 700 });
  await ctx.click('form input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx);

  await ctx.line("register");
  await page.goto(`${BASE}/pos/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-product-id]", { timeout: 30000 });
  await ctx.settle();
  await ctx.pause(1200);
  await ctx.click((await productCard(page, "Pink Kush (AAAA+)")).sel, { settle: 1200 });
  const preset = '[data-tour="weight-preset"][data-weight="3.5"]';
  if (await page.$(preset)) await ctx.click(preset, { settle: 1200 });
  const title = L("Age Verification Required");
  await page.waitForFunction((w) => w.some((x) => document.body.innerText.includes(x)), { timeout: 15000 }, title);

  await ctx.line("check");
  await ctx.pause(1500);
  await ctx.click(await topmost(page, L("Age Verified"), "verified"), { settle: 1500 });

  await ctx.line("done");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

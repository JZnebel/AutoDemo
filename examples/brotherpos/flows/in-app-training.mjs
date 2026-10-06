/** Starting the training courses: turn on the register's Training button and start cashier
 *  training; then Manager training from the back office's account menu. */
import { afterNav } from "../admin.mjs";
import { topmost, L } from "../register.mjs";
import { adminThenRegister } from "./_admin_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "in-app-training", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await adminThenRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("intro");
  await ctx.pause(2500);

  await ctx.line("turnon");
  await ctx.click('[data-tour="settings-btn"]', { settle: 1200 });
  await ctx.reveal("#show-training-button");
  if (!(await page.$eval("#show-training-button", (c) => c.checked))) await ctx.click("#show-training-button", { settle: 800 });
  await ctx.click(await topmost(page, L("Save Settings"), "save"), { settle: 1500 });

  await ctx.line("start");
  await page.waitForSelector('[data-tour="training-btn"]', { visible: true, timeout: 10000 });
  // The "Settings saved" message sits over the top-right corner, right where Training is.
  await page.waitForFunction(() => !document.querySelector('[aria-live="polite"].fixed.top-4.right-4')?.children.length, { timeout: 10000 }).catch(() => {});
  // Saving settings refreshes the register for a moment; a click in that window opens the
  // course window and loses it again. Let it settle, and try once more if it didn't open.
  await ctx.pause(1500);
  const startText = L("Start training");
  const opened = () => page.waitForFunction((w) => [...document.querySelectorAll("button")].some((b) => w.includes(b.innerText.trim()) && b.offsetParent), { timeout: 5000 }, startText).then(() => true).catch(() => false);
  await ctx.click('[data-tour="training-btn"]', { settle: 1500 });
  if (!(await opened())) {
    await ctx.click('[data-tour="training-btn"]', { settle: 1500 });
    if (!(await opened())) throw new Error("the training window didn't open");
  }
  await ctx.click(await topmost(page, startText, "start"), { settle: 3000 });

  await ctx.line("practice");
  await ctx.pause(2500);

  await ctx.line("manager");
  await page.goto(`${BASE}/products`, { waitUntil: "domcontentloaded" });
  await afterNav(ctx, { selector: 'button[onclick="toggleDropdown(\'user-menu\')"]' });
  await ctx.click('button[onclick="toggleDropdown(\'user-menu\')"]', { settle: 900 });
  const menu = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[onclick*="training:open"]')].find((x) => !x.getAttribute("onclick").includes("owner") && x.offsetParent);
    a?.setAttribute("data-rec", "mgr");
    return !!a;
  });
  if (!menu) throw new Error("no Manager training in the menu");
  await ctx.click('[data-rec="mgr"]', { settle: 2500 });

  await ctx.line("lessons");
  await ctx.pause(2500);
  const start = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].filter((x) => /^(Start training|Commencer la formation)$/.test(x.innerText.trim()) && x.offsetParent).pop();
    b?.setAttribute("data-rec", "mstart");
    return !!b;
  });
  if (!start) throw new Error("no Start training in the back office");
  await ctx.click('[data-rec="mstart"]', { settle: 3000 });

  await ctx.line("done");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

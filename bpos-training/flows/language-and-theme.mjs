/** Changing the language and dark/light mode, on the register and in the back office. The
 *  English take switches to French and the French take to English. The back office is signed
 *  in off camera first, and the register is opened without wiping the browser (openRegister
 *  would sign the back office out), so the clip can cut straight from one to the other. */
import { openAdmin, afterNav } from "../admin.mjs";
import { BASE, creds } from "../config.mjs";
import { sleep } from "../recorder.mjs";

export const meta = { id: "language-and-theme", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

let other;
export async function setup(ctx, { lang }) {
  other = lang === "fr" ? "en" : "fr";
  const { page } = ctx;
  await openAdmin(ctx, { path: "/products" });
  await page.goto(`${BASE}/pos/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("pos-locale", l); }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "5"), { timeout: 30000 });
  for (const d of creds().clerkPin) {
    await page.evaluate((digit) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === digit)?.click(), d);
    await sleep(180);
  }
  await page.waitForSelector("[data-product-id]", { timeout: 30000 });
  await ctx.ensureCursor();
  await ctx.settle();
  await sleep(2000);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("register");
  await ctx.click('[data-tour="settings-btn"]', { settle: 1200 });

  await ctx.line("pick");
  const sel = await page.evaluate(() => {
    const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "fr") && [...x.options].some((o) => o.value === "es"));
    s?.setAttribute("data-rec", "lang");
    return !!s;
  });
  if (!sel) throw new Error("no language list");
  await ctx.reveal('[data-rec="lang"]');
  await ctx.select('[data-rec="lang"]', other, { settle: 2200 });

  await ctx.line("dark");
  const dark = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^(Switch to|Passer au mode|Cambiar a)/i.test(x.innerText.trim()));
    b?.setAttribute("data-rec", "theme");
    return !!b;
  });
  if (!dark) throw new Error("no Switch to Dark button");
  await ctx.click('[data-rec="theme"]', { settle: 2200 });

  await ctx.line("admin");
  await page.goto(`${BASE}/products`, { waitUntil: "domcontentloaded" });
  await afterNav(ctx, { selector: '[data-dropdown="lang-menu"] button' });
  await ctx.pause(800);
  await ctx.click('[data-dropdown="lang-menu"] button', { settle: 900 });
  await ctx.click(`#lang-menu-dropdown form[action*="locale=${other}"] button`, { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(1200);

  await ctx.line("moon");
  await ctx.click('button.theme-toggle[onclick="toggleTheme()"]', { settle: 2000 });
  await ctx.finishSpeaking();
}

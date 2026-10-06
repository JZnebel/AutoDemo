/** House accounts: Pat Lee's tab (balance, limit, history), then recording a payment. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "house-accounts", seed: ["--house-account", "--open-drawer"], viewport: { width: 1600, height: 900 } };

const NOTE = { en: "Paid by e-transfer", fr: "Payé par virement" };
let note = NOTE.en;

export async function setup(ctx, { lang }) {
  note = NOTE[lang] || NOTE.en;
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("turn-on");
  await ctx.click('nav a[href="/customers"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table, main a[href^='/customers/']" });
  const pat = await page.evaluate(() => {
    const a = [...document.querySelectorAll('main a[href^="/customers/"]')].find((x) => /Pat Lee/.test(x.textContent) && /^\/customers\/\d+$/.test(x.getAttribute("href")));
    a?.setAttribute("data-rec", "pat");
    return !!a;
  });
  if (!pat) throw new Error("no Pat Lee in the customer list");
  await ctx.click('[data-rec="pat"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href$="/edit#house-account"]' });

  await ctx.line("panel");
  await ctx.reveal('main a[href$="/edit#house-account"]', { always: true });
  await ctx.pause(2500);

  await ctx.line("register");
  await ctx.pause(2500);

  await ctx.line("payment");
  await ctx.click('main a[href$="/edit#house-account"]', { settle: 500 });
  await afterNav(ctx, { selector: "#house_account_payment" });
  await ctx.reveal("#house_account_payment");
  await ctx.type("#house_account_payment", "20", { delay: 150, settle: 300 });
  await ctx.select("#house_account_payment_method", "etransfer", { settle: 400 });
  await ctx.type("#house_account_payment_notes", note, { delay: 60, settle: 400 });
  const save = await page.evaluate(() => {
    const b = document.querySelector("#house_account_payment")?.closest("form")?.querySelector('input[type="submit"], button[type="submit"]');
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Update Customer");
  await ctx.click('[data-rec="save"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !location.pathname.endsWith("/edit")), "the payment didn't save");

  await ctx.line("history");
  await ctx.reveal("main table", { always: true });
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

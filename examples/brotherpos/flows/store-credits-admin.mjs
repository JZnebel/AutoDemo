/** A customer's profile -> Store Credit -> Adjust Balance: $15 for a returned item. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "store-credits-admin", seed: ["--store-credit"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/customers?search=Jamie" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  const link = await page.evaluate(() => {
    const a = [...document.querySelectorAll("main a")].find((x) => x.innerText.trim() === "Jamie Morin" && x.getBoundingClientRect().width > 0);
    a?.setAttribute("data-rec", "jamie");
    return !!a;
  });
  if (!link) throw new Error("no Jamie Morin link");
  await ctx.click('[data-rec="jamie"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href$="/edit#store-credit"]' });

  await ctx.line("card");
  await ctx.pointAt('main a[href$="/edit#store-credit"]', { settle: 1500 });
  await ctx.click('main a[href$="/edit#store-credit"]', { settle: 500 });
  await afterNav(ctx, { selector: "#store_credit_adjustment" });

  await ctx.line("amount");
  await ctx.type("#store_credit_adjustment", "15", { delay: 200, settle: 400 });
  await ctx.type("#store_credit_reason", "Returned item", { delay: 90, settle: 700 });

  await ctx.line("paid");
  await ctx.pointAt("#store_credit_payment_method", { settle: 2000 });

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('form input[type="submit"][name="commit"]')].filter((x) => x.offsetParent).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Update Customer button");
  await ctx.click('[data-rec="save"]', { settle: 500 });
  await afterNav(ctx);
  const ok = await page.evaluate(() => /15[.,]00/.test(document.querySelector("main")?.innerText || ""));
  if (!ok) throw new Error("the credit isn't on the profile");
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("main h2, main h3, main dt")].find((e) => /Store Credit|Crédit en magasin/i.test(e.innerText));
    h?.scrollIntoView({ block: "center" });
  });
  await ctx.settle();
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

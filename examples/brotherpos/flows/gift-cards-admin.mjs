/** Back office Gift Cards: issue a $25 card for a customer, then look it up. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";

export const meta = { id: "gift-cards-admin", seed: ["--gift-cards"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await navClick(ctx, "/admin/gift_cards");
  await afterNav(ctx, { selector: 'main a[href="/admin/gift_cards/new"]' });
  await ctx.click('main a[href="/admin/gift_cards/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#gift_card_original_amount" });

  await ctx.line("amount");
  await ctx.type("#gift_card_original_amount", "25", { delay: 200, settle: 400 });
  const jamie = await page.evaluate(() => [...document.querySelectorAll("#gift_card_customer_id option")].find((o) => o.textContent.trim() === "Jamie Morin")?.value);
  if (!jamie) throw new Error("no Jamie Morin in the customer list");
  await ctx.select("#gift_card_customer_id", jamie, { settle: 900 });

  await ctx.line("paid");
  await ctx.select("#payment_method", "debit", { settle: 1500 });

  await ctx.line("create");
  await ctx.click('form input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx);
  const number = await page.evaluate(() => (document.querySelector("main")?.innerText.match(/GC[0-9A-F]{8,}/) || [])[0]);
  if (!number) throw new Error("no card number on the page");
  await ctx.pause(2000);

  await ctx.line("check");
  await navClick(ctx, "/admin/gift_cards");
  await afterNav(ctx, { selector: 'main input[name="search"]' });
  await ctx.type('main input[name="search"]', "Jamie", { delay: 150, settle: 300 });
  await page.keyboard.press("Enter");
  await afterNav(ctx);
  await ctx.pause(2500);

  await ctx.line("void");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

/** Customers: search, open a profile, edit it. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "customer-management", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('nav a[href="/customers"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main input[name="search"]' });

  await ctx.line("search");
  await ctx.type('main input[name="search"]', "Jamie", { delay: 150, settle: 300 });
  await page.keyboard.press("Enter");
  await afterNav(ctx);
  await ctx.pause(600);

  await ctx.line("profile");
  const link = await page.evaluate(() => {
    const a = [...document.querySelectorAll("main a")].find((x) => x.innerText.trim() === "Jamie Morin" && x.getBoundingClientRect().width > 0);
    a?.setAttribute("data-rec", "jamie");
    return !!a;
  });
  if (!link) throw new Error("no Jamie Morin link");
  await ctx.click('[data-rec="jamie"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(3500);

  await ctx.line("edit");
  await ctx.click('main a.btn[href$="/edit"]', { settle: 500 });
  await afterNav(ctx, { selector: "#customer_email" });
  await ctx.type("#customer_email", "jamie.morin@example.com", { delay: 70, settle: 600 });

  await ctx.line("save");
  await ctx.click('form input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx);
  const ok = await page.evaluate(() => /jamie\.morin@example\.com/.test(document.body.innerText));
  if (!ok) throw new Error("the email wasn't saved");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

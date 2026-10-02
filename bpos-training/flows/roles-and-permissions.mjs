/** Settings -> Manage Users -> Role Permissions: let cashiers sell gift cards. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "roles-and-permissions", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/store_settings" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1800);
  await ctx.click('main a.btn[href="/users"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/permissions"]' });
  await ctx.click('main a[href="/admin/permissions"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="clerk_manage_gift_cards"][type="checkbox"]' });

  await ctx.line("grid");
  await ctx.pause(3000);

  await ctx.line("tick");
  const box = 'input[name="clerk_manage_gift_cards"][type="checkbox"]';
  await page.$eval(box, (e) => e.closest("tr").scrollIntoView({ block: "center" }));
  await ctx.settle();
  if (await page.$eval(box, (e) => e.checked)) throw new Error("clerks can already sell gift cards");
  await ctx.click(box, { settle: 1200 });

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('form[action="/admin/permissions"] button[type="submit"]')].pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Save Permissions button");
  await ctx.click('[data-rec="save"]', { settle: 500 });
  await afterNav(ctx, { selector: box });
  if (!(await page.$eval(box, (e) => e.checked))) throw new Error("the permission wasn't saved");
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.settle();

  await ctx.line("custom");
  await ctx.pointAt('input[name="name"][maxlength="40"]', { settle: 2500 });
  await ctx.finishSpeaking();
}

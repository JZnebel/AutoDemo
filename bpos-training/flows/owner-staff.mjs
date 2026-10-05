/** Owner portal -> People -> Add person: one person, a role at each of two stores, a home
 *  store, a register PIN. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "owner-staff", seed: ["--second-store"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/owner" });
  // The owner dashboard adds up every store's week before it draws; give it time.
  await ctx.page.waitForSelector('main a[href="/owner/staff"]', { timeout: 90000 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('main a[href="/owner/staff"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href^="/owner/staff/new"]' });
  await ctx.click('main a.btn[href^="/owner/staff/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#user_first_name" });

  await ctx.line("who");
  await ctx.type("#user_first_name", "Jesse", { delay: 90, settle: 200 });
  await ctx.type("#user_last_name", "Hill", { delay: 90, settle: 200 });
  await ctx.type("#user_email", "jesse@riverstone.training", { delay: 45, settle: 300 });
  await ctx.type("#user_password", "riverstone24", { delay: 60, settle: 300 });
  await ctx.type("#user_pin", "5281", { delay: 220, settle: 600 });

  await ctx.line("where");
  const roles = await page.$$eval('select[name^="roles["]', (els) => els.map((e) => e.id));
  if (roles.length < 2) throw new Error("expected a role picker for each store");
  await ctx.select(`#${roles[0]}`, "clerk", { settle: 900 });
  await ctx.select(`#${roles[1]}`, "manager", { settle: 900 });

  await ctx.line("home");
  await ctx.click('input[type="radio"][name="home_store_id"]', { settle: 1000 });

  await ctx.line("add");
  await ctx.click('form[action="/owner/staff"] input[type="submit"]', { settle: 500 });
  // Saving a person takes a while on the local server; wait to leave the form.
  await page.waitForFunction(() => !document.querySelector('form[action="/owner/staff"]'), { timeout: 60000 }).catch(() => {});
  await afterNav(ctx);
  const ok = await page.evaluate(() => /Jesse/.test(document.body.innerText));
  if (!ok) throw new Error("Jesse wasn't added");
  await ctx.pause(1500);

  await ctx.line("leave");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

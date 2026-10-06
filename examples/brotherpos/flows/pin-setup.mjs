/** Settings -> Manage Users -> Edit -> a new PIN for Riley. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "pin-setup", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/store_settings" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('main a.btn[href="/users"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href^="/users/"][href$="/edit"]' });

  await ctx.line("edit");
  const edit = await page.evaluate(() => {
    // The smallest box holding Riley's name and an Edit link: their own row, not the whole list.
    const row = [...document.querySelectorAll("main tr, main li, main div")]
      .filter((r) => /Riley/.test(r.innerText) && r.querySelectorAll('a[href^="/users/"][href$="/edit"]').length === 1)
      .sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
    const a = row?.querySelector('a[href^="/users/"][href$="/edit"]');
    a?.setAttribute("data-rec", "edit-riley");
    return !!a;
  });
  if (!edit) throw new Error("no Edit for Riley");
  await ctx.click('[data-rec="edit-riley"]', { settle: 500 });
  await afterNav(ctx, { selector: "#user_pin" });

  await ctx.line("pin");
  await ctx.type("#user_pin", "7391", { delay: 260, settle: 900 });

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('form input[type="submit"][name="commit"]')].filter((x) => x.offsetParent).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Save changes button");
  await ctx.click('[data-rec="save"]', { settle: 500 });
  await afterNav(ctx);
  if (await page.$("#user_pin")) throw new Error("the staff form came back with an error");
  const who = await page.evaluate(() => document.title + " " + (document.querySelector("main")?.innerText || ""));
  if (!/Riley/.test(who)) throw new Error("didn't land back on Riley");
  await ctx.pause(1200);

  await ctx.line("approve");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

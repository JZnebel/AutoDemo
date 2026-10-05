/** Products -> More Actions -> Menu Boards: a template for the main TV, then its preview. */
import { openAdmin, afterNav } from "../admin.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "menu-board", seed: ["--menu-board"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

async function tick(page, name, tag) {
  const ok = await page.evaluate((n, t) => {
    const cb = [...document.querySelectorAll('input[name="category_ids[]"]')].find((c) => (c.closest("label")?.innerText || "").trim() === n);
    cb?.closest("label")?.setAttribute("data-rec", t);
    return !!cb;
  }, name, tag);
  if (!ok) throw new Error(`no ${name} category`);
  return `[data-rec="${tag}"]`;
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/menu_board_templates"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/menu_board_templates/new"]' });

  await ctx.line("new");
  await ctx.click('main a[href="/admin/menu_board_templates/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#menu_board_template_name" });
  await ctx.type("#menu_board_template_name", "Main Floor", { delay: 110, settle: 600 });

  await ctx.line("categories");
  for (const [n, t] of [["Flower", "c1"], ["Pre-Rolls", "c2"], ["Edibles", "c3"]]) await ctx.click(await tick(page, n, t), { settle: 500 });

  await ctx.line("create");
  await ctx.click('form input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx);
  const id = await page.evaluate(async () => {
    const html = await (await fetch("/admin/menu_board_templates", { headers: { Accept: "text/html" } })).text();
    return (html.match(/display=menu-board&(?:amp;)?template=(\d+)/) || [])[1] || null;
  });
  if (!id) throw new Error("no menu board template");
  await ctx.pause(1200);

  await ctx.line("preview");
  await page.goto(`${BASE}/pos?display=menu-board&template=${id}`, { waitUntil: "domcontentloaded" });
  await afterNav(ctx);
  await ctx.pause(3500);

  await ctx.line("tv");
  await ctx.pause(3000);
  await ctx.finishSpeaking();
}

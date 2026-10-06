/** Settings -> Sales & Integrations -> Get embed code: copy the menu snippet, tailor it in the
 *  builder, and see the live preview. */
import { openAdmin, afterNav } from "../admin.mjs";
import { openEditSettings } from "./_settings_common.mjs";

export const meta = { id: "online-menu-embed", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  await ctx.page.setBypassCSP(true);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);
  await ctx.line("open");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="integrations"]', { settle: 800 });
  await ctx.reveal('#tab-integrations a[href="/admin/online_menu"]', { always: true });
  await ctx.click('#tab-integrations a[href="/admin/online_menu"]', { settle: 500 });
  await afterNav(ctx, { selector: "#menu-snippet" });
  await ctx.line("copy");
  await ctx.pointAt("#menu-snippet", { settle: 1500 });
  await ctx.line("paste");
  await ctx.pause(2000);
  await ctx.line("builder");
  await ctx.reveal("#builder-cat", { always: true });
  const edibles = await page.$eval("#builder-cat", (s) => [...s.options].find((o) => /Edible|Comestible/i.test(o.text))?.value || "");
  if (edibles) await ctx.select("#builder-cat", edibles, { settle: 800 });
  const dark = await page.$eval("#builder-theme", (s) => [...s.options].find((o) => /dark|sombre/i.test(o.text + o.value))?.value || "");
  if (dark) await ctx.select("#builder-theme", dark, { settle: 1200 });
  await ctx.pointAt("#builder-snippet", { settle: 1200 });
  await ctx.line("age");
  await ctx.reveal("#online-menu-preview", { always: true });
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

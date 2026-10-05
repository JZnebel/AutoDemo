/** Products -> More Actions -> Product Catalog (CSV): the whole product list as a spreadsheet. */
import { openAdmin } from "../admin.mjs";

export const meta = { id: "csv-export", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  // A real download would open the computer's save window; keep it quiet.
  const cdp = await ctx.page.target().createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("filters");
  await ctx.pointAt('form[action="/products"]', { settle: 1800 });

  await ctx.line("menu");
  await ctx.click('[data-tour="more-actions"] > summary', { settle: 900 });
  const link = '[data-tour="more-actions"] a[href^="/products.csv"], [data-tour="more-actions"] a[href^="/products?"][href*="format=csv"]';
  await ctx.pointAt(link, { settle: 900 });
  await ctx.click(link, { settle: 800 });

  await ctx.line("open");
  await ctx.pause(2500);

  await ctx.line("import");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

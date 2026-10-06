/** Storefront: is the site live, Customize, then the public site with its age check. */
import { openAdmin, afterNav } from "../admin.mjs";
import { openStorefront, storefrontUrl } from "./_storefront_common.mjs";

export const meta = { id: "storefront-overview", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  await ctx.page.setBypassCSP(true);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await openStorefront(ctx);
  await ctx.pointAt('[data-tour="sf-status"]', { settle: 2000 });

  await ctx.line("construction");
  await ctx.pause(2500);

  await ctx.line("customize");
  await ctx.click('[data-tour="sf-customize"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-action*="storefront-editor#navigate"]' });
  await ctx.click('[data-action*="storefront-editor#navigate"][data-section="theme_and_colors"]', { settle: 1500 });

  await ctx.line("publish");
  await ctx.pointAt('button[formaction$="/admin/storefront/publish"]', { settle: 2000 }).catch(() => ctx.pause(2000));

  await ctx.line("ordering");
  await ctx.pause(2500);

  await ctx.line("age");
  await ctx.goto(storefrontUrl("/"));
  await ctx.expect(() => page.evaluate(() => /age-gate|verify-age/.test(location.href + document.body.innerHTML)), "no age check on the storefront", 30000);
  await ctx.pause(1200);
  const yes = await page.$('a[href*="/verify-age?verified=true"]');
  if (yes) { await ctx.click('a[href*="/verify-age?verified=true"]', { settle: 800 }); await afterNav(ctx); }
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

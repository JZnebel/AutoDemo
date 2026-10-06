/** Shared by the storefront clips. */
import { afterNav, navClick } from "../admin.mjs";
import { BASE, CONFIG } from "../config.mjs";

/** The store's public site (STOREFRONT_DOMAIN is trafficstores.ca; Chrome maps it locally). */
export function storefrontUrl(path = "/") {
  const port = new URL(CONFIG.localBase).port || "80";
  return `http://${CONFIG.subdomain}.trafficstores.ca:${port}${path}`;
}

/** Storefront (top menu), on camera. */
export async function openStorefront(ctx) {
  await navClick(ctx, "/admin/storefront");
  await afterNav(ctx, { selector: '[data-tour="sf-customize"]' });
}

/** Customize, then one section of the editor (by its sidebar item, or its ?section= link). */
export async function openEditorSection(ctx, section) {
  await ctx.click('[data-tour="sf-customize"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-action*="storefront-editor#navigate"]' });
  const item = `[data-action*="storefront-editor#navigate"][data-section="${section}"]`;
  if (await ctx.page.$(item)) await ctx.click(item, { settle: 900 });
  else { await ctx.goto(`${BASE}/admin/storefront/edit?section=${section}`); await afterNav(ctx); }
}

/** The editor's Save (a draft), then Publish. */
export async function saveAndPublish(ctx) {
  const { page } = ctx;
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('input[type="submit"], button[type="submit"]')]
      .find((x) => x.getBoundingClientRect().width > 0 && !x.getAttribute("formaction") && x.closest("form")?.action?.includes("/admin/storefront"));
    b?.setAttribute("data-rec", "sf-save");
    return !!b;
  });
  if (!save) throw new Error("no Save in the storefront editor");
  await ctx.click('[data-rec="sf-save"]', { settle: 600 });
  await afterNav(ctx);
  const publish = 'button[formaction$="/admin/storefront/publish"]:not([disabled])';
  await ctx.expect(() => page.$(publish), "Publish never became available");
  await ctx.click(publish, { settle: 600 });
  await afterNav(ctx);
}

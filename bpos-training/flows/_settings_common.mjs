/** Shared by the store-settings clips. */
import { afterNav } from "../admin.mjs";

/** Settings (top menu) -> Edit Settings, on camera. */
export async function openEditSettings(ctx) {
  await ctx.click('nav a[href="/store_settings"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/store_settings/edit"]' });
  await ctx.click('main a[href="/store_settings/edit"]', { settle: 500 });
  await afterNav(ctx, { selector: ".settings-tab" });
}

/** The big form's own Update Settings button, and wait for the save. */
export async function updateSettings(ctx) {
  const { page } = ctx;
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll('form[action="/store_settings"] input[type="submit"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    b?.setAttribute("data-rec", "update-settings");
    return !!b;
  });
  if (!ok) throw new Error("no Update Settings button");
  await ctx.click('[data-rec="update-settings"]', { settle: 500 });
  await afterNav(ctx);
}

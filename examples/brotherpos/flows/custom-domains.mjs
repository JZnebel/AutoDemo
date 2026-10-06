/** Storefront -> your own web address: point the A record, verify, and how it shows when live. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { openStorefront, openEditorSection } from "./_storefront_common.mjs";

export const meta = { id: "custom-domains", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  await ctx.page.setBypassCSP(true);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("free");
  await openStorefront(ctx);
  await ctx.pause(1200);
  await ctx.line("own");
  await openEditorSection(ctx, "domain_and_more");
  const domain = 'input[name="storefront_config[custom_domain]"]';
  await ctx.reveal(domain, { always: true });
  await ctx.type(domain, "shop.riverstonecannabis.ca", { delay: 70, settle: 800 });
  await ctx.line("verify");
  const verify = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, input[type="submit"]')].find((x) => x.getBoundingClientRect().width > 0 && /verif/i.test(x.textContent + (x.value || "") + (x.getAttribute("formaction") || "")));
    b?.setAttribute("data-rec", "verify");
    return !!b;
  });
  if (verify) await ctx.pointAt('[data-rec="verify"]', { settle: 2500 });
  else await ctx.pause(2500);
  await ctx.line("search");
  await ctx.pointAt('[data-action*="domain-search#search"]', { settle: 2500 }).catch(() => ctx.pause(2500));
  await ctx.line("live");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

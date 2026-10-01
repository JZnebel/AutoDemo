/**
 * Starting your shift: PIN in, count the float, open the drawer; then lock when you step
 * away and the next person signs in with their own PIN. The store has no drawer open.
 */
import { openRegister, byText, typePin, L } from "../register.mjs";
import { creds } from "../config.mjs";

export const meta = { id: "starting-your-shift", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang, signIn: false });
}

export async function run(ctx) {
  const { page } = ctx;
  const pins = creds();

  await ctx.pause(500);
  await ctx.line("pin");
  await ctx.pause(1500);
  await typePin(ctx, pins.clerkPin);
  await page.waitForFunction(() => document.querySelector('input[type="number"]'), { timeout: 20000 });
  await ctx.pause(800);

  await ctx.line("count");
  await ctx.pause(1800);
  await ctx.type('input[type="number"]', "200", { delay: 260, settle: 600 });

  await ctx.line("open");
  await ctx.pause(900);
  await ctx.click(await byText(page, L("Open Cash Drawer"), "button", "open-drawer"), { settle: 1200 });
  await page.waitForSelector("[data-product-id]", { timeout: 20000 });
  await ctx.pause(1500);

  await ctx.line("lock");
  await ctx.pause(900);
  await ctx.click('[data-tour="lock-btn"]', { settle: 1500 });

  await ctx.line("next");
  await ctx.pause(1500);
  await typePin(ctx, pins.managerPin);
  await page.waitForSelector("[data-product-id]", { timeout: 20000 });
  await ctx.pause(800);
  // "...recorded under their name": the name now showing in the top bar.
  await ctx.pointAt(await byText(page, ["Sam"], "nav span, nav div, nav p, header span, header div", "who"), { settle: 300 });
  await ctx.finishSpeaking();
}

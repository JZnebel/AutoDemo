/** Scanning: a USB scanner types the code and Enter, fast. Nothing focused first. */
import { openRegister } from "../register.mjs";
import { sleep } from "autodemo/recorder";

export const meta = { id: "barcode-scanner", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

/** What a keyboard-wedge scanner does: the whole code in a few milliseconds, then Enter.
 *  A pulse on screen stands in for the beep, so the viewer sees when a scan happened. */
async function scan(ctx, code) {
  const { page } = ctx;
  await page.evaluate(() => {
    const b = document.createElement("div");
    b.textContent = "▮▮▯▮▯▮▮ beep";
    b.style.cssText = "position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);padding:14px 22px;border-radius:12px;background:rgba(15,23,32,.85);color:#fff;font:600 22px system-ui;z-index:2147483646;pointer-events:none;transition:opacity .4s";
    document.body.appendChild(b);
    setTimeout(() => { b.style.opacity = "0"; }, 650);
    setTimeout(() => b.remove(), 1100);
  });
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.type(code, { delay: 6 });
  await page.keyboard.press("Enter");
  await sleep(1300);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("plug");
  await ctx.pause(4500);

  await ctx.line("scan");
  await ctx.pause(1200);
  await scan(ctx, "10000009");   // Mango Gummies
  if (!(await page.$eval('[data-tour="cart-pane"]', (e) => /Mango Gummies/.test(e.innerText)))) throw new Error("scan didn't add the item");
  await ctx.pause(800);

  await ctx.line("again");
  await ctx.pause(400);
  await scan(ctx, "10000009");
  const cart = await page.$eval('[data-tour="cart-pane"]', (e) => e.innerText);
  if (!/Mango Gummies 10mg x 10\s+2\b/.test(cart)) throw new Error(`second scan didn't make 2: ${cart.slice(0, 120)}`);
  await ctx.pointAt('[data-tour="qty-increase"]', { settle: 800 });

  await ctx.line("unknown");
  await ctx.pause(1400);
  await scan(ctx, "62811234");
  if (!(await page.evaluate(() => /Unrecognized barcode|Code-barres non reconnu/.test(document.body.innerText)))) throw new Error("no Unrecognized barcode window");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

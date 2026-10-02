/** Taking over a drawer someone else opened: Sam (manager) left Register 1 open; Riley signs
 *  in, closes Sam's shift with a count and opens their own. Needs two registers, or the
 *  register skips the Select Register screen. */
import { openRegister, typePin, topmost, L } from "../register.mjs";
import { creds } from "../config.mjs";

export const meta = { id: "drawer-takeover", seed: ["--open-drawer", "--second-register"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, signIn: false }); }

/** The two number boxes in the takeover window: the count, then the new float. */
async function takeoverInputs(page) {
  const ok = await page.evaluate(() => {
    const box = [...document.querySelectorAll(".fixed .rounded-lg")].find((d) => d.querySelector("h2") && d.querySelectorAll("input").length >= 2);
    const inputs = box ? [...box.querySelectorAll("input")] : [];
    inputs[0]?.setAttribute("data-rec", "count");
    inputs[1]?.setAttribute("data-rec", "float");
    return inputs.length >= 2;
  });
  if (!ok) throw new Error("no takeover window");
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);
  await typePin(ctx, creds().clerkPin);
  await page.waitForFunction((w) => [...document.querySelectorAll("button")].some((b) => w.includes(b.innerText.trim())), { timeout: 20000 }, L("Close & open mine"));
  await ctx.settle();

  await ctx.line("find");
  await ctx.pause(1500);
  await ctx.click(await topmost(page, L("Close & open mine"), "takeover"), { settle: 1500 });

  await ctx.line("count");
  await takeoverInputs(page);
  await ctx.type('[data-rec="count"]', "195", { delay: 220, settle: 1200 });

  await ctx.line("short");
  await ctx.pause(2500);

  await ctx.line("float");
  await ctx.type('[data-rec="float"]', "150", { delay: 220, settle: 900 });

  await ctx.line("confirm");
  await ctx.click(await topmost(page, L("Close & open mine"), "confirm"), { settle: 1500 });
  await page.waitForSelector("[data-product-id]", { timeout: 20000 });
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

/** Creating a customer from the register's customer box. */
import { openRegister, byText, L } from "../register.mjs";

export const meta = { id: "new-customer", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("search");
  await ctx.pause(1800);
  await ctx.type('[data-tour="customer-search"] input', "Taylor Reid", { delay: 150, settle: 1200 });
  await ctx.click(await byText(page, L("Create New Customer"), "button", "create-new"), { settle: 1300 });

  await ctx.line("details");
  await ctx.pause(1200);
  const phone = await page.evaluate((w) => {
    const i = [...document.querySelectorAll("input")].find((x) => w.includes((x.placeholder || "").trim()));
    if (!i) return null;
    i.setAttribute("data-rec", "phone");
    return '[data-rec="phone"]';
  }, L("Phone (optional)"));
  if (!phone) throw new Error("no phone field");
  await ctx.type(phone, "7055550199", { delay: 140, settle: 800 });

  await ctx.line("create");
  await ctx.pause(500);
  await ctx.click(await byText(page, L("Create"), "button", "create"), { settle: 2000 });
  await ctx.finishSpeaking();
}

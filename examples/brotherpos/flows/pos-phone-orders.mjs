/** Phone orders at the register: CREATE ORDER for pickup, save it, then complete it when paid. */
import { openRegister, byText, byTextStart, productCard, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "pos-phone-orders", seed: ["--open-drawer", "--online-orders"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

const up = (xs) => xs.map((x) => x.toUpperCase());
const saleStatus = () => railsRun(`puts Sale.where(source: "phone_order").order(:created_at).last&.status`).trim();

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("create");
  await ctx.click(await byText(page, up(L("Create Order")), "button", "create"), { settle: 900 });
  await ctx.line("who");
  await ctx.type("#order-new-name", "Taylor Brooks", { delay: 70, settle: 300 });
  await ctx.type("#order-new-phone", "705-555-0199", { delay: 80, settle: 500 });
  await ctx.click(await byText(page, L("Continue"), "button", "next"), { settle: 900 });
  await ctx.line("how");
  await ctx.click(await byTextStart(page, L("In-Store Pickup"), "button", "pickup"), { settle: 500 });
  await ctx.click(await byTextStart(page, L("Cash"), "button", "cash"), { settle: 500 });
  await ctx.click(await byText(page, L("Start Adding Items"), "button", "start"), { settle: 900 });
  await ctx.line("ring");
  const { sel } = await productCard(page, "House Pre-Roll 1g");
  await ctx.click(sel, { settle: 600 });
  await ctx.click(sel, { settle: 900 });
  await ctx.line("save");
  await ctx.click(await byText(page, L("Save Order for Pickup"), "button", "save"), { settle: 1200 });
  await ctx.expect(async () => saleStatus() === "pending", "the order wasn't saved as pending");
  await ctx.line("nocharge");
  await ctx.pause(1200);
  await ctx.click(await byText(page, L("Done"), "button", "done"), { settle: 700 });

  await ctx.line("pays");
  const tab = async () => byTextStart(page, L("Orders"), "button", "orders-tab");
  await ctx.click(await tab(), { settle: 900 });
  await ctx.expect(() => page.evaluate(() => {
    const hits = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().width > 0 && /Taylor Brooks/.test(e.innerText || ""));
    const el = hits.sort((a, b) => a.innerText.length - b.innerText.length).find((e) => e.closest("button, [role=button], li, tr, [class*=cursor-pointer]")) || hits[0];
    (el?.closest("button, [role=button], li, tr, [class*=cursor-pointer]") || el)?.setAttribute("data-rec", "order");
    return !!el;
  }), "the saved order isn't under Orders");
  await ctx.click('[data-rec="order"]', { settle: 1200 });
  await ctx.line("complete");
  await ctx.click(await byText(page, L("Mark Completed"), "button", "markdone"), { settle: 900 });
  await ctx.click(await byTextStart(page, L("Cash"), '[role="dialog"] button', "paycash"), { settle: 500 });
  await ctx.click(await byText(page, L("Complete"), '[role="dialog"] button', "complete"), { settle: 1200 });
  await ctx.expect(async () => saleStatus() === "completed", "the order wasn't completed");
  await ctx.line("done");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

/** Raffles, shot 2 of 3: selling entries at the register (a customer must be on the sale). */
import { openRegister, byTextStart, topmost, productCard, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "raffles-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

export async function run(ctx) {
  const { page } = ctx;
  const entry = railsRun(`puts Raffle.order(:created_at).last.entry_product.name`).trim().split("\n").pop();
  await ctx.pause(400);
  await ctx.line("customer");
  await ctx.type('[data-tour="customer-search"] input', "Jamie", { delay: 150, settle: 1300 });
  await ctx.click(await byTextStart(page, ["Jamie Morin"], '[role="listbox"] button', "jamie"), { settle: 1300 });
  await ctx.line("entries");
  const { sel } = await productCard(page, entry);
  await ctx.click(sel, { settle: 700 });
  await ctx.click(sel, { settle: 900 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 800 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 500 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 1800 });
  await ctx.expect(async () => Number(railsRun(`puts RaffleEntry.count`).trim()) >= 2, "the entries weren't recorded");
  await ctx.line("each");
  await ctx.click(await topmost(page, L("Start New Sale"), "newsale"), { settle: 1000 });
  await ctx.finishSpeaking();
}

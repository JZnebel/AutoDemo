/** Customers -> Loyalty -> Add Reward: $20 off for 400 points. */
import { openAdmin, afterNav, labelFor, A } from "../admin.mjs";

export const meta = { id: "loyalty-rewards", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/admin/loyalty" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await page.evaluate(() => document.querySelector('main a[href="/admin/loyalty_rewards/new"]')?.scrollIntoView({ block: "center" }));
  await ctx.settle();
  await ctx.pause(1800);
  await ctx.click('main a[href="/admin/loyalty_rewards/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#loyalty_reward_name" });

  await ctx.line("name");
  await ctx.type("#loyalty_reward_name", "$20 Off", { delay: 130, settle: 300 });
  await ctx.type("#loyalty_reward_points_required", "400", { delay: 200, settle: 700 });

  await ctx.line("type");
  await ctx.click('label:has(input[name="loyalty_reward[reward_type]"][value="discount"])', { settle: 900 });
  await ctx.click('label:has(input[name="discount_type_selector"][value="fixed"])', { settle: 900 });
  await ctx.type("#loyalty_reward_discount_amount", "20", { delay: 200, settle: 800 });

  await ctx.line("create");
  await ctx.click('form[data-tour="reward-form"] input[type="submit"]', { settle: 500 });
  await afterNav(ctx);
  if (await page.$("#loyalty_reward_name")) throw new Error("the reward form came back with an error");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

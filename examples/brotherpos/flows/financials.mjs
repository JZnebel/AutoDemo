/** Reports -> Financials: Profit & Loss for the year so far, This Month, then Cash Flow. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "financials", seed: ["--second-store", "--cash-flow"], viewport: { width: 1600, height: 900 } };

const EXPENSES = `
owner = User.find_by!(first_name: "Morgan")
# The demo store has one week of sales, so its costs are scaled to a week too.
BusinessExpense.create!(category: "rent", amount: 700, expense_date: Date.current.beginning_of_month, cash_flow_section: "operating",
                        description: "Store rent (week)", created_by: owner)
BusinessExpense.create!(category: "utilities", amount: 120, expense_date: Date.current.beginning_of_month, cash_flow_section: "operating", description: "Hydro", created_by: owner)
BusinessExpense.create!(category: "equipment", amount: 1200, expense_date: Date.current - 20, cash_flow_section: "investing", description: "Display case", created_by: owner)
# Cost on the week's sales, so gross profit isn't the whole of sales.
SaleLineItem.joins(:sale).where(sales: { status: "completed" }).find_each do |li|
  li.update_columns(unit_cost: (li.unit_price.to_f * 0.45).round(2)) if li.has_attribute?(:unit_cost)
end
`;

export async function setup(ctx) {
  railsRun(EXPENSES);
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await ctx.click('main a[data-tour="report-financials"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="financials-page"]' });

  await ctx.line("totals");
  await ctx.pointAt('[data-test="net-sales"]', { settle: 2500 });

  await ctx.line("dates");
  const month = await page.evaluate(() => {
    const a = [...document.querySelectorAll("main a.date-preset")][0];
    a?.setAttribute("data-rec", "month");
    return !!a;
  });
  if (!month) throw new Error("no date buttons");
  await ctx.click('[data-rec="month"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="financials-page"]' });

  await ctx.line("cash");
  await ctx.click('nav[data-test="report-tabs"] a[data-tab="cash_flow"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="financials-page"]' });
  await ctx.pause(2500);

  await ctx.line("expenses");
  // Expenses is in the top menu too, but with it on the menu folds into ☰; point at the
  // report's own link instead.
  await ctx.reveal('main a[href="/admin/business_expenses"]', { always: true });
  await ctx.pointAt('main a[href="/admin/business_expenses"]', { settle: 2500 });
  await ctx.finishSpeaking();
}

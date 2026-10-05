/** Reports -> Product Issues: the open ones, one issue's details, notes, Mark as Resolved. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "product-issues", seed: [], viewport: { width: 1600, height: 900 } };

const ISSUES = `
clerk = User.find_by!(first_name: "Riley"); mgr = User.find_by!(first_name: "Sam")
mk = ->(name, attrs) { ProductIssue.create!({ product: Product.find_by!(name: name), reported_by: clerk }.merge(attrs)) }
mk.("House Pre-Roll 1g", issue_type: "damaged", description: ENV.fetch("D1"), action_taken: "refund", refund_method: "cash", amount: 9, customer_name: "Pat Lee").update_columns(created_at: 2.days.ago)
mk.("Black Cherry Punch (AA)", issue_type: "moldy", description: ENV.fetch("D2"), action_taken: "courtesy_replacement", customer_name: "Jamie Morin").update_columns(created_at: 1.day.ago)
mk.("Mango Gummies 10mg x 10", issue_type: "expired", description: ENV.fetch("D3"), action_taken: "exchange", customer_name: "Alex Bouchard").update_columns(created_at: 5.hours.ago)
mk.("Live Resin 510 Cart 0.5g", issue_type: "defective", description: ENV.fetch("D4"), action_taken: "refund", refund_method: "debit", amount: 40, customer_name: "Dana Whitfield", resolved_at: 3.days.ago).update_columns(created_at: 4.days.ago)
`;
const TEXT = {
  en: { D1: "Paper torn in the tube", D2: "Spots of mold in the bag", D3: "Best-before date passed", D4: "Cart won't draw", note: "Supplier credit requested" },
  fr: { D1: "Papier déchiré dans le tube", D2: "Taches de moisissure dans le sac", D3: "Date de péremption dépassée", D4: "La cartouche ne tire pas", note: "Crédit demandé au fournisseur" },
};
let text = TEXT.en;

export async function setup(ctx, { lang }) {
  text = TEXT[lang] || TEXT.en;
  railsRun(ISSUES, text);
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1200);

  await ctx.line("open");
  await ctx.click('main a.action-card[href="/admin/product_issues"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("boxes");
  await ctx.pointAt("main .grid", { settle: 2500 });

  await ctx.line("view");
  const row = await page.evaluate((d) => {
    const tr = [...document.querySelectorAll("main table tbody tr")].find((r) => r.innerText.includes(d) || /Black Cherry/.test(r.innerText));
    const a = tr?.querySelector('a[href^="/admin/product_issues/"]:not([href*="mark_resolved"])');
    a?.setAttribute("data-rec", "view");
    return !!a;
  }, text.D2);
  if (!row) throw new Error("no moldy issue row");
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx, { selector: 'textarea[name="product_issue[notes]"]' });
  await ctx.type('textarea[name="product_issue[notes]"]', text.note, { delay: 70, settle: 400 });
  const saveNotes = await page.evaluate(() => {
    const f = document.querySelector('textarea[name="product_issue[notes]"]')?.closest("form");
    f?.querySelector('[type="submit"]')?.setAttribute("data-rec", "save-notes");
    return !!f;
  });
  if (!saveNotes) throw new Error("no Save Notes");
  await ctx.click('[data-rec="save-notes"]', { settle: 600 });
  await afterNav(ctx);

  await ctx.line("resolve");
  const resolve = await page.evaluate(() => {
    const b = document.querySelector('form[action*="mark_resolved=true"] [type="submit"]');
    b?.setAttribute("data-rec", "resolve");
    return !!b;
  });
  if (!resolve) throw new Error("no Mark as Resolved");
  await ctx.click('[data-rec="resolve"]', { settle: 600 });
  await afterNav(ctx, { selector: "main table" });
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

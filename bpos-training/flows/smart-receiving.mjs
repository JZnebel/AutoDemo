/** Products -> More Actions -> Supplier Invoices: an invoice already read (the reading itself
 *  is a paid AI call, so it's seeded), checked against the purchase order, then applied. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "smart-receiving", seed: ["--smart-receiving"], viewport: { width: 1600, height: 900 } };

const INVOICE = `
owner = User.find_by!(first_name: "Morgan")
sup = Supplier.find_or_create_by!(name: "Great North Distribution") { |x| x.contact_name = "Lena Roy" }
pink = Product.find_by!(name: "Pink Kush (AAAA+)"); pre = Product.find_by!(name: "House Pre-Roll 1g")
po = PurchaseOrder.create!(supplier: sup, order_number: "PO-#{Date.current.strftime('%m%d')}-01", status: :confirmed, ordered_at: 2.days.ago,
                           subtotal: 432 + 96, tax_amount: 0, total: 432 + 96)
po.line_items.create!(product: pink, quantity: 24, unit_price: 18, line_total: 432, store_id: store.id)
po.line_items.create!(product: pre, quantity: 32, unit_price: 3, line_total: 96, store_id: store.id)
doc = SupplierDocument.new(supplier: sup, purchase_order: po, kind: "invoice", status: "needs_review", uploaded_by: owner,
  extracted_at: Time.current,
  extracted_header: { "supplier_name" => sup.name, "invoice_number" => "INV-20418", "invoice_date" => Date.current.to_s, "subtotal" => 578.0, "total" => 578.0 },
  arithmetic_check: { "checked" => true, "passed" => true, "computed_subtotal" => 578.0 },
  extracted_lines: [
    { "raw_description" => "PNK KUSH AAAA+ 1G", "raw_sku" => "GN-1182", "quantity" => 24, "unit_cost" => 18.0, "line_total" => 432.0, "product_id" => pink.id, "product_name" => pink.name, "match_method" => "similarity", "match_confidence" => 0.92 },
    { "raw_description" => "HOUSE PREROLL 1G", "raw_sku" => "GN-2210", "quantity" => 32, "unit_cost" => 3.0, "line_total" => 96.0, "product_id" => pre.id, "product_name" => pre.name, "match_method" => "sku", "match_confidence" => 1.0 },
    { "raw_description" => "MANGO GUMMY 10X10", "raw_sku" => "GN-3307", "quantity" => 5, "unit_cost" => 10.0, "line_total" => 50.0, "product_id" => nil, "match_method" => "none", "suggestions" => [{ "name" => "Mango Gummies 10mg x 10" }] },
  ])
doc.file.attach(io: File.open(Rails.root.join("public/apple-touch-icon.png")), filename: "INV-20418.png", content_type: "image/png")
doc.save!
`;

export async function setup(ctx) {
  railsRun(INVOICE);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1200);

  await ctx.line("open");
  await ctx.click('[data-tour="more-actions"] > summary', { settle: 800 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/supplier_documents"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/supplier_documents/new"]' });

  await ctx.line("upload");
  await ctx.click('main a[href="/admin/supplier_documents/new"]', { settle: 500 });
  await afterNav(ctx, { selector: 'select[name="supplier_document[supplier_id]"]' });
  await ctx.pointAt('input[name="supplier_document[file]"]', { settle: 900 });
  await ctx.pointAt('select[name="supplier_document[supplier_id]"]', { settle: 900 });
  await ctx.pointAt('form[action="/admin/supplier_documents"] [type="submit"]', { settle: 900 });
  // The reading itself is a paid service; this invoice was read before the clip.
  await ctx.goto(`${BASE}/admin/supplier_documents`);
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("review");
  await ctx.click('main table a[href^="/admin/supplier_documents/"]:not([href$="/new"])', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });
  await ctx.pointAt("main table", { settle: 2000 });

  await ctx.line("apply");
  await ctx.reveal('select[name="purchase_order_id"]');
  const po = await page.$eval('select[name="purchase_order_id"]', (s) => [...s.options].find((o) => o.value)?.value || "");
  if (!po) throw new Error("no purchase order to pick");
  await ctx.select('select[name="purchase_order_id"]', po, { settle: 700 });
  await ctx.click('form[action$="/apply"] [type="submit"]', { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !/\/admin\/supplier_documents\/\d+$/.test(location.pathname)), "the document wasn't applied");
  await ctx.pause(1200);

  await ctx.line("stock");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

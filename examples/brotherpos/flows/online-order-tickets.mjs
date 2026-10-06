/** An online order arrives while the register is open: the alert, the Orders tab, the order,
 *  Mark Ready, Load into Register. The order is placed off camera, mid-clip. */
import { exec } from "child_process";
import { openRegister, byText, byTextStart, L } from "../register.mjs";
import { CONFIG } from "../config.mjs";

export const meta = { id: "online-order-tickets", seed: ["--open-drawer", "--online-orders"], viewport: { width: 1600, height: 900 } };

const ORDER = `
s = Store.find_by!(subdomain: ENV.fetch("SUB"))
ActsAsTenant.with_tenant(s) do
  p = Product.find_by!(name: "Mango Gummies 10mg x 10")
  q = Product.find_by!(name: "House Pre-Roll 1g")
  total = p.price + q.price * 2
  Sale.create!(source: "online", status: "pending", online_order_number: "WEB-1042",
               customer: Customer.find_by!(name: "Jamie Morin"), payment_method: "cash",
               subtotal: total, tax_amount: 0, total: total,
               sale_line_items_attributes: [{ product: p, quantity: 1, unit_price: p.price, line_total: p.price },
                                            { product: q, quantity: 2, unit_price: q.price, line_total: q.price * 2 }])
end
`;

export async function setup(ctx, { lang }) {
  // Managers handle online orders (clerks don't have Manage Orders by default).
  await openRegister(ctx, { lang, who: "manager" });
  // The register takes a baseline on its first check and only alerts for orders after it.
  await ctx.pause(17000);
}

function placeOrder() {
  return new Promise((resolve, reject) => {
    const child = exec(`docker exec -i -e SUB=${CONFIG.subdomain} pos_app bin/rails runner -`, (err) => (err ? reject(err) : resolve()));
    child.stdin.end(ORDER);
  });
}

export async function run(ctx) {
  const { page } = ctx;
  const placed = placeOrder();
  await ctx.pause(500);
  await ctx.line("alert");
  await placed;

  await ctx.line("tab");
  const tab = async () => byTextStart(page, L("Orders"), "button", "orders-tab");
  await ctx.expect(async () => /\d/.test(await page.$eval(await tab(), (b) => b.textContent)), "the Orders tab never showed the new order", 40000);
  await ctx.click(await tab(), { settle: 900 });

  await ctx.line("order");
  // The order's row: the smallest clickable thing that mentions its number.
  await ctx.expect(() => page.evaluate(() => {
    // The row holds the number and the customer; take the smallest element that has both.
    const hits = [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().width > 0 && /WEB-1042/.test(e.innerText || "") && /Jamie/.test(e.innerText || ""));
    const el = hits.sort((a, b) => a.innerText.length - b.innerText.length)[0];
    el?.setAttribute("data-rec", "order");
    return !!el;
  }), "the order isn't in the list");
  await ctx.click('[data-rec="order"]', { settle: 1200 });

  await ctx.line("ready");
  await ctx.pointAt('[data-testid="online-order-mark-ready"]', { settle: 2000 });

  await ctx.line("load");
  await ctx.click(await byText(page, L("Load into Register"), "button", "load"), { settle: 1500 });
  await ctx.expect(() => page.evaluate(() => /Mango/.test(document.querySelector('[data-tour="cart"], [data-tour="cart-items"]')?.innerText || document.body.innerText)), "the order didn't load into the cart");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

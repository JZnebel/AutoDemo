/** Shared by the back-office flows. */
import { openRegister, quickSale } from "../register.mjs";
import { openAdmin } from "../admin.mjs";
import { execFileSync } from "child_process";
import { BASE, CONFIG, creds } from "../config.mjs";
import { sleep } from "autodemo/recorder";

/** A morning's trade, rung through the register off camera, so reports have something in
 *  them. Mixed items, cash and card. */
export async function ringSomeSales(ctx) {
  await openRegister(ctx, { lang: "en" });
  const sales = [
    [["House Pre-Roll 1g", "Mango Gummies 10mg x 10"], "cash"],
    [["Pink Kush (AAAA+)"], "card"],
    [["Mixed Strain Pre-Roll Pack (5 x 0.5g)"], "cash"],
    [["Glass Hand Pipe", "Mango Gummies 10mg x 10"], "card"],
    [["Wedding Cake (AAA)", "House Pre-Roll 1g"], "cash"],
    [["GMO Live Resin 1g"], "card"],
  ];
  for (const [items, pay] of sales) await quickSale(ctx, items, { pay });
}

/** A product's edit page, found by name through the products search. */
export async function productEditPath(page, name) {
  const id = await page.evaluate(async (n) => {
    const html = await (await fetch(`/products?search=${encodeURIComponent(n)}`, { headers: { Accept: "text/html" } })).text();
    return (html.match(/\/products\/(\d+)\/edit/) || [])[1] || null;
  }, name);
  if (!id) throw new Error(`no product "${name}"`);
  return `/products/${id}/edit`;
}

/** The newest order paid with `pay` ("cash" or "card"), as an /orders/:id path. Reads the
 *  Orders list, so it needs the back office signed in. */
export async function newestOrderPath(page, pay = "cash") {
  const path = await page.evaluate(async (p) => {
    const html = await (await fetch("/orders", { headers: { Accept: "text/html" } })).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const want = p === "card" ? /\b(Card|Carte|Debit|Débit)\b/i : /\b(Cash|Comptant|Espèces)\b/i;
    const row = [...doc.querySelectorAll('[data-tour="orders-table"] tr')].find((r) => want.test(r.textContent) && r.querySelector('a[href^="/orders/"]'));
    return row?.querySelector('a[href^="/orders/"]')?.getAttribute("href") || null;
  }, pay);
  if (!path) throw new Error(`no ${pay} order in the list`);
  return path;
}

/** Sign in to the back office off camera, then open the register in the same tab without
 *  wiping the browser (openRegister would sign the back office out), signed in with a PIN.
 *  A clip can then cut from the till to the back office with no sign-in on screen. */
export async function adminThenRegister(ctx, { lang = "en", who = "clerk" } = {}) {
  const { page } = ctx;
  await openAdmin(ctx, { path: "/products" });
  await page.goto(`${BASE}/pos/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("pos-locale", l); }, lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "5"), { timeout: 30000 });
  if (!who) {
    // Stay on the lock screen (its Time Clock button is how staff reach the time clock).
    await ctx.ensureCursor();
    await ctx.settle();
    return;
  }
  for (const d of creds()[`${who}Pin`]) {
    await page.evaluate((digit) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === digit)?.click(), d);
    await sleep(180);
  }
  await page.waitForSelector("[data-product-id]", { timeout: 30000 });
  await ctx.ensureCursor();
  await ctx.settle();
  await sleep(2000);
}

/** Run Ruby against the training store (off camera): `store` is the store, tenant set, and
 *  extra env vars come through `env`. Prints whatever the script puts. */
export function railsRun(code, env = {}) {
  const sets = Object.entries({ SUB: CONFIG.subdomain, ...env }).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const script = `store = Store.find_by!(subdomain: ENV.fetch("SUB"))\nActsAsTenant.with_tenant(store) do\n${code}\nend\n`;
  try {
    return execFileSync("docker", ["exec", ...sets, "pos_app", "bin/rails", "runner", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    // Rails' own message: the first line that isn't loader noise, minus its file path.
    const first = String(e.stderr || "").split("\n").find((l) => l.trim() && !/jemalloc/.test(l)) || "";
    const why = first.replace(/^.*?:in '[^']*': /, "");
    throw new Error(`setup script failed: ${why || e.message}`);
  }
}

/** Put a date into a date box the way a person's pick would land (React and plain forms both
 *  see the change). `value` is YYYY-MM-DD. The browser's own calendar never shows on camera. */
export async function setDate(ctx, sel, value) {
  await ctx.click(sel, { settle: 300 });
  await ctx.page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel, value);
  const got = await ctx.page.$eval(sel, (e) => e.value);
  if (got !== value) throw new Error(`setDate failed on ${sel}: got "${got}" want "${value}"`);
  await ctx.pause(500);
}

/** YYYY-MM-DD for `days` from today (local time). */
export function isoDay(days = 0) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

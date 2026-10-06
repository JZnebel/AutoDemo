/** Shared by the wholesale clips: Riverstone Cannabis buys from Northern Lights Wholesale
 *  (seed.mjs --wholesale; =connected pairs them first). Each store has its own address and
 *  login, so a clip signs in to one, then the other. */
import { sleep, log } from "autodemo/recorder";
import { goAdmin } from "../admin.mjs";
import { BASE, CONFIG, creds } from "../config.mjs";

const worker = CONFIG.subdomain.match(/\d+$/)?.[0] || "";
export const DIST = { name: "Northern Lights Wholesale", sub: `northernlights${worker}`, email: "owner@northernlights.training" };
export const RETAIL = { name: CONFIG.storeName, sub: CONFIG.subdomain, email: `owner@${CONFIG.subdomain.replace(/\d+$/, "")}.training` };
export const baseOf = (store) => BASE.replace(`//${CONFIG.subdomain}.`, `//${store.sub}.`);

/** Sign in to one store's back office (fresh cookies), then open `path` there. */
export async function signInTo(ctx, store, path = "/products") {
  const { page } = ctx;
  const base = baseOf(store);
  const cdp = await page.createCDPSession();
  await cdp.send("Network.clearBrowserCookies");
  await cdp.detach();
  await page.goto(`${base}/users/sign_in`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="password"]', { timeout: 20000 });
  for (let attempt = 0; ; attempt++) {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
    await page.$eval('input[type="email"], input[name="user[email]"]', (e, v) => { e.value = v; }, store.email);
    await page.$eval('input[type="password"]', (e, v) => { e.value = v; }, creds().password);
    await sleep(300);
    const ok = await page.$eval('input[type="email"], input[name="user[email]"]', (e, v) => e.value === v, store.email);
    if (ok || attempt >= 4) break;
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.$eval('form [type="submit"]', (b) => b.click()),
  ]);
  if (page.url().includes("/users/sign_in")) throw new Error(`sign-in to ${store.sub} didn't take`);
  log(`wholesale: signed in to ${store.sub}`);
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 20000 }).catch(() => {});
}
export { goAdmin };

/** Carries values between a clip's shots (they run in one process): the pairing code. */
export const shared = {};

/** Mark a catalog row's quantity box and Add button (new wholesale order page). */
export async function markCatalogRow(page, name, tag) {
  return page.evaluate((n, t) => {
    const input = [...document.querySelectorAll("input[data-order-qty]")].find((i) => i.dataset.productName === n);
    if (!input) return false;
    let box = input.parentElement;
    while (box && !box.querySelector('button[onclick^="addToCart"]')) box = box.parentElement;
    const btn = box?.querySelector('button[onclick^="addToCart"]');
    input.setAttribute("data-rec", `${t}-qty`);
    btn?.setAttribute("data-rec", `${t}-add`);
    return !!btn;
  }, name, tag);
}

export const ORDER = [["Boreal Berry Gummies 10x10mg", "24"], ["Northern Lights Pre-Roll 5-Pack", "12"]];

/** Off camera: the retailer places the usual order (signs in to the retailer). */
export async function placeOrderOffCamera(ctx) {
  const { page } = ctx;
  await signInTo(ctx, RETAIL, "/admin/distributor_connections");
  const href = await page.$eval('a[href^="/admin/wholesale_orders/new?distributor_connection_id="]', (a) => a.getAttribute("href"));
  await page.goto(`${baseOf(RETAIL)}${href}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[data-order-qty]", { timeout: 20000 });
  for (const [i, [name, qty]] of ORDER.entries()) {
    if (!(await markCatalogRow(page, name, `o${i}`))) throw new Error(`${name} isn't in the catalog`);
    await page.$eval(`[data-rec="o${i}-qty"]`, (e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, qty);
    await page.click(`[data-rec="o${i}-add"]`);
    await sleep(300);
  }
  await page.waitForFunction(() => !document.getElementById("submit-btn")?.disabled, { timeout: 10000 });
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), page.click("#submit-btn")]);
}

/** Off camera: the distributor moves the newest order along (approve, pack, ready, picked up). */
export async function advanceOrderOffCamera(ctx, steps) {
  const { page } = ctx;
  const { railsRun } = await import("./_admin_common.mjs");
  const id = railsRun(`puts WholesaleOrder.order(:created_at).last.id`, { SUB: DIST.sub }).trim();
  await signInTo(ctx, DIST, `/admin/wholesale_orders/${id}`);
  for (const step of steps) {
    const sel = `form[action="/admin/wholesale_orders/${id}/${step}"] [type="submit"]`;
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.click(sel);
    const modal = await page.waitForSelector("#confirmation-modal-confirm-btn", { visible: true, timeout: 2500 }).catch(() => null);
    if (modal) await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}), modal.click()]);
    else await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {});
  }
  return id;
}

/** Click the confirm modal's button if one opened (on camera). */
export async function confirmIfAsked(ctx) {
  const open = await ctx.page.waitForSelector("#confirmation-modal-confirm-btn", { visible: true, timeout: 2500 }).catch(() => null);
  if (open) await ctx.click("#confirmation-modal-confirm-btn", { settle: 700 });
}

/** Products -> More Actions -> Scan to Receive: scan a delivery in, set the cost, receive. The
 *  "scans" are typed into the scan box with Enter, which is exactly what a USB scanner sends. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "scan-to-receive", seed: ["--scan-to-receive"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

const BOX = '[data-scan-to-receive-target="barcodeInput"]';
async function scan(ctx, code) {
  await ctx.type(BOX, code, { delay: 25, settle: 100 });
  await ctx.page.keyboard.press("Enter");
  await ctx.pause(1100);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/scan_to_receive"]', { settle: 500 });
  await afterNav(ctx, { selector: BOX });

  await ctx.line("po");
  // Only shown when there are open purchase orders.
  if (await page.$("#po-select")) await ctx.pointAt("#po-select", { settle: 2000 });
  else await ctx.pointAt(BOX, { settle: 2000 });

  await ctx.line("scan");
  await scan(ctx, "10000009"); // Mango Gummies
  await scan(ctx, "10000009");
  await scan(ctx, "10000009");
  await scan(ctx, "10000011"); // Glass Hand Pipe
  await page.waitForSelector('[data-scan-to-receive-target="table"]:not(.hidden)', { timeout: 8000 });

  await ctx.line("check");
  const cost = await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[data-batch-field="unit_cost"]')].filter((x) => x.offsetParent);
    inp[0]?.setAttribute("data-rec", "cost1");
    return inp.length;
  });
  if (cost < 2) throw new Error(`expected 2 lines, got ${cost}`);
  await ctx.type('[data-rec="cost1"]', "12", { delay: 180, settle: 800 });

  await ctx.line("receive");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
    ctx.click('button[data-action="click->scan-to-receive#receiveAll"]', { settle: 500 }),
  ]);
  await afterNav(ctx);
  const stock = await page.evaluate(async () => {
    const html = await (await fetch("/products?search=Mango", { headers: { Accept: "text/html" } })).text();
    return /\b43\b/.test(new DOMParser().parseFromString(html, "text/html").body.textContent);
  });
  if (!stock) throw new Error("the gummies didn't go up by 3");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

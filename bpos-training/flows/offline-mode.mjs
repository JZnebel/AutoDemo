/** Selling with no internet: the register queues the sale and sends it when it's back. The
 *  connection is cut with Chrome's network emulation, which the register sees as offline. */
import { once, openRegister, productCard, topmost, L } from "../register.mjs";

export const meta = { id: "offline-mode", seed: ["--open-drawer"], offlineOnPurpose: true, viewport: { width: 1600, height: 900 } };

let cdp;
export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  cdp = await ctx.page.target().createCDPSession();
}

const net = (offline) => cdp.send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("offline");
  await net(true);
  await page.waitForFunction((w) => w.some((x) => (document.querySelector('[data-tour="sync-status"]')?.getAttribute("aria-label") || "").includes(x)), { timeout: 15000 }, L("Offline"));
  await ctx.pointAt('[data-tour="sync-status"]', { settle: 2500 });

  await ctx.line("sell");
  await ctx.click((await productCard(page, "Glass Hand Pipe")).sel, { settle: 800 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 1000 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 700 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 2500 });

  await ctx.line("count");
  await ctx.click(await topmost(page, L("Start New Sale"), "new"), { settle: 1200 });
  await ctx.pointAt('[data-tour="sync-status"]', { settle: 2500 });

  await ctx.line("back");
  await net(false);
  await ctx.pause(1500);
  await ctx.click('[data-tour="sync-status"]', { settle: 1200 });
  const syncNow = await once(() => topmost(page, L("Sync Now"), "sync-now")).catch(() => null);
  if (syncNow) await ctx.click(syncNow, { settle: 3000 });
  const synced = await page.waitForFunction(async () => {
    const r = await fetch("/api/v1/sales?per_page=5", { credentials: "include" }).catch(() => null);
    return !!r;
  }, { timeout: 5000 }).then(() => true).catch(() => false);
  if (!synced) throw new Error("still offline");

  await ctx.line("check");
  await page.keyboard.press("Escape").catch(() => {});
  await ctx.pause(800);
  await ctx.pointAt('[data-tour="cart-pane"]', { settle: 2500 });
  await ctx.finishSpeaking();
}

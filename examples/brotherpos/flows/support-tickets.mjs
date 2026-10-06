/** Getting help: Get Support in the back office (and on the register, shot 2).
 *  The ticket must never reach the real support desk, so the filming browser answers that one
 *  request itself (Chrome's Fetch interception, only for the ticket URL). */
import { openAdmin } from "../admin.mjs";

export const meta = { id: "support-tickets", seed: [], viewport: { width: 1600, height: 900 } };

/** Answer POSTs to `pattern` with a made-up ticket, so nothing is sent to the support desk. */
export async function fakeTicketDesk(page, pattern) {
  const cdp = await page.createCDPSession();
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: pattern, requestStage: "Request" }] });
  cdp.on("Fetch.requestPaused", async (e) => {
    if (e.request.method !== "POST") return cdp.send("Fetch.continueRequest", { requestId: e.requestId }).catch(() => {});
    const body = JSON.stringify({ success: true, support_id: "BPS-7K4Q2", ticket_number: "T-10482", ticket_id: 10482, access_granted: false });
    await cdp.send("Fetch.fulfillRequest", {
      requestId: e.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(body).toString("base64"),
    }).catch(() => {});
  });
  return cdp;
}

let desk;
export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  desk = await fakeTicketDesk(ctx.page, "*/admin/support_tickets");
  await hideMachineName(ctx.page);
}

/** The printer bridge reports this filming machine's own name in the diagnostics; show a
 *  till's name instead, from the moment it appears. */
export async function hideMachineName(page) {
  const host = (await import("os")).hostname();
  await page.evaluate((h) => {
    const fix = (root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) if (n.nodeValue.includes(h)) n.nodeValue = n.nodeValue.split(h).join("FRONT-COUNTER-PC");
    };
    fix(document.body);
    new MutationObserver((ms) => ms.forEach((m) => { m.addedNodes.forEach((n) => fix(n.nodeType === 3 ? n.parentNode || document.body : n)); if (m.type === "characterData") fix(m.target.parentNode || document.body); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }, host);
}

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const [subject, details] = lang === "fr"
    ? ["Le reçu ne s'imprime pas", "Depuis ce matin, la caisse 1 n'imprime plus les reçus. Le Printer Bridge est ouvert et l'imprimante est allumée."]
    : ["Receipts not printing", "Since this morning Register 1 won't print receipts. The Printer Bridge is running and the printer is on."];
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('[data-dropdown="user-menu"] > button', { settle: 900 });
  await ctx.click('a[onclick*="openSupportModal"]', { settle: 1200 });
  await ctx.line("what");
  await ctx.select("#support-category", await page.$eval("#support-category", (s) => [...s.options].map((o) => o.value).find((v) => /print/i.test(v)) || s.options[1]?.value || s.value), { settle: 500 });
  await ctx.line("blocking");
  await ctx.click("#blocking-no", { settle: 600 });
  await ctx.line("describe");
  await ctx.type("#support-subject", subject, { delay: 45, settle: 300 });
  await ctx.type("#support-description", details, { delay: 18, settle: 500 });
  await ctx.line("details");
  await ctx.pointAt("#support-system-diagnostics, #support-printer-status", { settle: 1500 });
  await ctx.line("send");
  await ctx.click("#support-submit-btn", { settle: 1500 });
  await ctx.expect(() => page.$eval("#support-success", (e) => !e.classList.contains("hidden")), "the ticket didn't go through");
  await ctx.line("number");
  await ctx.pause(2500);
  await desk?.send("Fetch.disable").catch(() => {});
  await ctx.finishSpeaking();
}

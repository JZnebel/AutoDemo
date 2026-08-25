/**
 * Exercise the universal product importer against a fixture and report what it
 * did — used both to check the feature works and to script the video.
 *
 * usage: import-test.mjs <fixture> [--add]
 *   without --add it stops at the review step and writes nothing.
 */
import { writeFileSync } from "fs";
import { connect, makeCtx, BASE } from "./recorder.mjs";
import { STORE_ID as ID } from "./config.mjs";
import { signIn } from "./signin.mjs";


const FILE = process.argv[2];
const DO_ADD = process.argv.includes("--add");
const MODAL_FILE = 'input[type="file"][accept*=".csv"]';

const { browser, page } = await connect();
const ctx = makeCtx(page);
const api = [];
page.on("response", async (r) => {
  if (/\/products\/(import|parse)/.test(r.url())) {
    let t = ""; try { t = await r.text(); } catch {}
    api.push({ status: r.status(), route: r.url().split("/").pop(), body: t });
  }
});
page.on("pageerror", (e) => console.log("PAGE EXC:", String(e).slice(0, 160)));

await signIn(ctx);
await ctx.goto(`${BASE}/admin/stores/${ID}/menu`);
await ctx.settle(); await ctx.pause(1500);

await page.evaluate(() => [...document.querySelectorAll("button")]
  .find((b) => b.innerText.trim() === "Paste a menu")?.click());
await ctx.pause(1200);
await page.evaluate(() => [...document.querySelectorAll("button")]
  .find((b) => b.innerText.trim() === "Upload export")?.click());
await ctx.pause(900);

const input = await page.$(MODAL_FILE);
if (!input) { console.log("FAIL: no modal file input"); await browser.disconnect(); process.exit(1); }
await input.uploadFile(FILE);
await ctx.pause(1200);
console.log("picked:", await page.evaluate(() => {
  const t = document.body.innerText;
  const m = t.match(/([^\n]*\.(csv|tsv|txt|xlsx|xls))[^\n]*/i);
  return m ? m[0].trim().slice(0, 90) : "(filename not shown)";
}));

await page.evaluate(() => [...document.querySelectorAll("button")]
  .find((b) => /^Import products$/i.test(b.innerText.trim()))?.click());

// wait for the mapping call to land
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  await ctx.pause(1500);
  if (api.length) break;
}
await ctx.pause(2500);

for (const a of api) {
  console.log(`API ${a.status} ${a.route}`);
  if (process.env.DUMP) { writeFileSync(process.env.DUMP, a.body); console.log(`  full body -> ${process.env.DUMP}`); }
  else console.log("  " + a.body.slice(0, 220));
}
const state = await page.evaluate(() => {
  const txt = document.body.innerText;
  const grab = (re) => (txt.match(re) || [null])[0];
  return {
    summary: grab(/Your export has [^\n]*/),
    error: grab(/(could not|couldn.t|failed|error|too large|Upload a CSV)[^\n]*/i),
    checkboxes: [...document.querySelectorAll('input[type=checkbox]')].map((c) => {
      const row = c.closest("label") || c.parentElement;
      return { on: c.checked, label: (row?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60) };
    }),
    // Scope to the modal: the page behind it has its own "Add …" buttons that a
    // loose match happily picks up instead of the review's confirm.
    buttons: (() => {
      const all = [...document.querySelectorAll("div")];
      const modal = all.filter((d) => /Your export has|No products found/i.test(d.innerText || ""))
        .sort((a, b) => a.innerText.length - b.innerText.length)[0];
      return [...(modal || document).querySelectorAll("button")]
        .map((b) => b.innerText.replace(/\s+/g, " ").trim()).filter(Boolean);
    })(),
  };
});
console.log("REVIEW:", JSON.stringify(state, null, 1));
await page.screenshot({ path: `${process.env.SHOT || "/tmp/import"}-review.png`, fullPage: true });

// The review is two steps: choose sections → "Review products" → confirm the list.
const clickByText = (re) => page.evaluate((src) => {
  const rx = new RegExp(src, "i");
  const b = [...document.querySelectorAll("button")].find((x) => rx.test(x.innerText.replace(/\s+/g, " ").trim()));
  if (!b) return null;
  b.click();
  return b.innerText.replace(/\s+/g, " ").trim();
}, re.source);

if (DO_ADD) {
  console.log("step 1:", await clickByText(/^Review products$/) ?? "(no Review products button)");
  await ctx.pause(3000);
  const confirm = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.innerText.replace(/\s+/g, " ").trim())
      .filter((t) => /^Add\b.*menu$|^Add \d+|^Add all/i.test(t)));
  console.log("confirm candidates:", JSON.stringify(confirm));
  console.log("step 2:", await clickByText(/^Add\b.*menu$|^Add \d+|^Add all/) ?? "(no confirm button)");
  await ctx.pause(8000);
  console.log("after add:", await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 160)));
}
await browser.disconnect();

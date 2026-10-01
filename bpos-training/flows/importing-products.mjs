/** Products -> More Actions -> Import from File -> preview -> import. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "new-products.csv");
export const meta = { id: "importing-products", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2000);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/products/import"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[type="file"]' });

  await ctx.line("template");
  await ctx.pause(400);
  const tpl = await page.evaluate(() => {
    const a = document.querySelector('a[href*="import_template"][href*="minimal"]') || document.querySelector('a[href*="import_template"]');
    a?.setAttribute("data-rec", "tpl");
    return !!a;
  });
  if (tpl) await ctx.pointAt('[data-rec="tpl"]', { settle: 2500 });

  await ctx.line("upload");
  const drop = await page.evaluate(() => {
    const i = document.querySelector('input[type="file"]');
    const t = i?.closest("label") || i?.parentElement;
    t?.setAttribute("data-rec", "drop");
    return !!t;
  });
  if (!drop) throw new Error("no upload box");
  await ctx.upload('[data-rec="drop"]', 'input[type="file"]', FIXTURE, { settle: 3000 });
  await page.waitForFunction(() => /IMPORT PREVIEW|APERÇU/i.test(document.body.innerText), { timeout: 15000 })
    .catch(() => { throw new Error("no import preview"); });
  await page.evaluate(() => [...document.querySelectorAll("h2,h3,div")].find((e) => /^(IMPORT PREVIEW|APERÇU)/i.test((e.innerText || "").trim()) && e.children.length < 3)?.setAttribute("data-rec", "preview"));
  if (await page.$('[data-rec="preview"]')) await ctx.reveal('[data-rec="preview"]', { block: 0.2, always: true });
  await ctx.pause(1500);

  await ctx.line("import");
  await ctx.pause(300);
  const btn = await page.evaluate((w) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const b = [...document.querySelectorAll("main button, main input[type=submit]")].filter((e) => w.includes(norm(e.innerText || e.value)) && e.getBoundingClientRect().width > 0 && !e.disabled).pop();
    b?.setAttribute("data-rec", "go");
    return !!b;
  }, A("Import Products"));
  if (!btn) throw new Error("no enabled Import Products button");
  await ctx.click('[data-rec="go"]', { settle: 500 });
  await page.waitForFunction(() => /Blue Dream|imported|importé|terminé|complete/i.test(document.body.innerText) && !/Importing\.\.\.|Importation\.\.\./.test(document.body.innerText), { timeout: 30000 });
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

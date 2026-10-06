/** Products -> More Actions -> Label Templates -> New Template: size, three details, save,
 *  then Set as default. */
import { openAdmin, afterNav } from "../admin.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "label-templates", seed: [], viewport: { width: 1600, height: 900 } };

const NAME = { en: "Jar Label", fr: "Étiquette de pot" };
let name = NAME.en;

export async function setup(ctx, { lang }) {
  name = NAME[lang] || NAME.en;
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1200);

  await ctx.line("open");
  await ctx.click('[data-tour="more-actions"] > summary', { settle: 800 });
  await ctx.click('[data-tour="more-actions"] a[href="/label_templates"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/label_templates/new"]' });
  await ctx.click('main a[href="/label_templates/new"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="label_template[name]"]' });

  await ctx.line("size");
  await ctx.type('input[name="label_template[name]"]', name, { delay: 90, settle: 400 });
  await ctx.click('button[data-action="click->label-editor#applySize"][data-width="50"][data-height="30"]', { settle: 900 });

  await ctx.line("details");
  // A new template starts with the name and the price; add a barcode under them.
  const add = 'button[data-action="click->label-editor#addElement"]';
  const base = await page.$$eval('select[data-action="change->label-editor#changeType"]', (els) => els.length);
  await ctx.click(add, { settle: 700 });
  await ctx.select(`select[data-action="change->label-editor#changeType"][data-index="${base}"]`, "barcode", { settle: 800 });
  for (const [cls, v] of [["element-x", 4], ["element-y", 15]]) {
    const sel = `input.${cls}[data-index="${base}"]`;
    await page.$eval(sel, (e) => { e.value = ""; });
    await ctx.type(sel, String(v), { delay: 90, settle: 300 });
  }
  await ctx.pointAt('canvas[data-label-canvas-target="canvas"]', { settle: 1500 });

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#label-template-form [type="submit"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no Save button");
  await ctx.click('[data-rec="save"]', { settle: 600 });
  await ctx.expect(() => page.evaluate(() => location.pathname === "/label_templates" || /\/label_templates\/\d+$/.test(location.pathname)), "the template didn't save");
  await afterNav(ctx);
  if (!/\/label_templates$/.test(page.url())) {
    await ctx.goto(`${BASE}/label_templates`);
    await afterNav(ctx, { selector: "main" });
  }

  await ctx.line("default");
  const row = await page.evaluate((n) => {
    const card = [...document.querySelectorAll("main form[action$='/set_default']")]
      .find((f) => (f.closest("li, tr, .dashboard-card, [class*='card']")?.innerText || "").includes(n));
    card?.querySelector("button, input[type=submit]")?.setAttribute("data-rec", "default");
    return !!card;
  }, name);
  if (!row) throw new Error("no Set as default for the new template");
  await ctx.reveal('[data-rec="default"]');
  await ctx.click('[data-rec="default"]', { settle: 800 });
  await afterNav(ctx);
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}

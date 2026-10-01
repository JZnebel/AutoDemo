/** Product info -> Print Label -> quantity -> print, to this register's label printer. */
import { openRegister, productCard, topmost, L } from "../register.mjs";
import { ensurePrinters, printedBytes, LABEL_OUT } from "../printers.mjs";
import { sleep } from "../recorder.mjs";

export const meta = { id: "printing-labels", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await ensurePrinters();
  await openRegister(ctx, { lang, who: "manager" });
  // Off camera: point this register's label printer at the bridge (a Zebra on port 9101).
  const { page } = ctx;
  await page.click('[data-tour="settings-btn"]'); await sleep(1300);
  await page.evaluate(() => { const i = document.getElementById("label-printer-enabled"); if (i && !i.checked) i.click(); });
  await sleep(1000);
  await page.evaluate(() => {
    const l = [...document.querySelectorAll("label")].find((x) => /^(Use a printer bridge|Utiliser un pont)/.test(x.innerText.trim()));
    const i = l?.querySelector("input"); if (i && !i.checked) i.click();
  });
  await sleep(800);
  // The bridge's address: this computer. (Auto-Detect picks the LAN address; the filming
  // bridge only listens on localhost.)
  const ip = await page.evaluate(() => {
    const sec = document.getElementById("label-printer-enabled").closest("div").parentElement.parentElement;
    const inp = sec.querySelector('input[type="text"]');
    if (!inp) return null;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(inp, "localhost");
    inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
    return inp.value;
  });
  await sleep(500);
  if (!ip) throw new Error("label bridge not detected");
  await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0).reverse().find((b) => /^(Save Settings|Enregistrer les paramètres)$/.test(b.innerText.trim()))?.click());
  await sleep(2500);
  await ctx.settle();
}

export async function run(ctx) {
  const { page } = ctx;
  const before = printedBytes(LABEL_OUT);
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  const { sel } = await productCard(page, "Mango Gummies 10mg x 10");
  await page.evaluate((s) => document.querySelector(s).querySelector('button[title]')?.setAttribute("data-rec", "info"), sel);
  await ctx.click('[data-rec="info"]', { settle: 1500 });

  await ctx.line("print");
  await ctx.click(await topmost(page, L("Print Label"), "pl"), { settle: 1500 });

  await ctx.line("qty");
  await ctx.pause(1500);
  const go = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].filter((x) => x.getBoundingClientRect().width > 0).reverse().find((x) => /^(Print \d+ Labels?|Imprimer \d+ étiquettes?)/.test(x.innerText.trim()));
    b?.setAttribute("data-rec", "go");
    return !!b;
  });
  if (!go) throw new Error("no Print N Label(s) button");
  await ctx.click('[data-rec="go"]', { settle: 3000 });
  if (printedBytes(LABEL_OUT) <= before) throw new Error("the label didn't reach the label printer");
  await ctx.finishSpeaking();
}

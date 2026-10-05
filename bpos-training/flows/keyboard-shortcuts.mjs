/** The register's keys: scan anywhere, type in search, Enter/Escape in the quantity box and
 *  pickers. Each key press shows on screen as a key cap (a key press alone is invisible). */
import { openRegister, productCard, L } from "../register.mjs";

// The quantity button on a cart line, by its label in either language.
const QTY = L("Click to edit quantity").map((t) => `button[title="${t}"]`).join(", ");

export const meta = { id: "keyboard-shortcuts", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

const KEYS = {
  en: { Enter: "⏎ Enter", Escape: "Esc", ArrowDown: "↓", scan: "Scan" },
  fr: { Enter: "⏎ Entrée", Escape: "Échap", ArrowDown: "↓", scan: "Lecture" },
};
let keys = KEYS.en;

export async function setup(ctx, { lang }) {
  keys = KEYS[lang] || KEYS.en;
  await openRegister(ctx, { lang });
}

/** Show a key cap in the corner for a moment. */
async function cap(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("rec-keycap");
    if (!el) {
      el = document.createElement("div");
      el.id = "rec-keycap";
      el.style.cssText = "position:fixed;right:28px;bottom:28px;z-index:2147483647;padding:10px 18px;border-radius:10px;" +
        "background:#111827;color:#fff;font:600 22px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.35);border-bottom:4px solid #374151;transition:opacity .3s";
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = "1";
    clearTimeout(window.__capT);
    window.__capT = setTimeout(() => { el.style.opacity = "0"; }, 1300);
  }, text);
}

async function press(ctx, key) {
  await cap(ctx.page, keys[key] || key);
  await ctx.page.keyboard.press(key);
  await ctx.pause(700);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1800);

  await ctx.line("scan");
  // A scanner types into the page itself; make sure no box has the focus and the register has
  // finished loading, or the code lands in the search field.
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur?.());
  await cap(page, `${keys.scan} 10000007`);
  await page.keyboard.type("10000007", { delay: 8 });
  await page.keyboard.press("Enter");
  await ctx.expect(() => page.evaluate((q) => !!document.querySelector(q), QTY), "the scan didn't add the pre-roll");
  await ctx.pause(1200);

  await ctx.line("search");
  await ctx.click('[data-tour="product-search"] input', { settle: 300 });
  await ctx.type('[data-tour="product-search"] input', "Mango", { delay: 120, settle: 800 });
  await ctx.click((await productCard(page, "Mango Gummies 10mg x 10")).sel, { settle: 900 });

  await ctx.line("qty");
  await ctx.click(QTY, { settle: 500 });
  await page.keyboard.press("Backspace");
  await cap(page, "3");
  await page.keyboard.type("3", { delay: 100 });
  await ctx.pause(400);
  await press(ctx, "Enter");

  await ctx.line("picker");
  // Empty the search again so the whole menu is back.
  await ctx.click('[data-tour="product-search"] input', { settle: 200 });
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await ctx.pause(600);
  await ctx.click((await productCard(page, "Live Resin 510 Cart 0.5g")).sel, { settle: 900 });
  await page.waitForSelector('[data-tour="variation-modal"]', { timeout: 15000 });
  await press(ctx, "ArrowDown");
  await press(ctx, "Escape");

  await ctx.line("pin");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}

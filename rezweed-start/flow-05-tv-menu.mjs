import { BASE } from "./recorder.mjs";
import { STORE_ID } from "./config.mjs";
/**
 * The in-store TV menu — building the board, then the board itself.
 *
 * Shot at /admin/stores/[id]/tv-menu as the owner. The builder shows an empty
 * state until a store has visible products, so seed-menu.mjs puts a menu on
 * Moonwater first; cleanup.mjs takes it away again.
 *
 * The clip ends on the board rather than the builder, because the board is the
 * thing an owner is trying to get. "Open TV menu" is target="_blank" and a new
 * tab is not what the recorder is pointed at, so the last beat navigates to the
 * board URL in place — which is also literally what happens on the TV: the link
 * gets loaded on the screen.
 */


export const meta = {
  name: "05-tv-menu",
  title: "A menu board for the shop TV",
  url: `${BASE}/admin/stores/${STORE_ID}/tv-menu`,
  viewport: { width: 1280, height: 720 },
};

async function byText(page, text, name, css = "button") {
  const ok = await page.evaluate((c, t, n) => {
    const el = [...document.querySelectorAll(c)].find((e) => (e.innerText || "").trim() === t);
    if (!el) return false;
    el.setAttribute("data-rec", n);
    return true;
  }, css, text, name);
  if (!ok) throw new Error(`not found: ${css} "${text}"`);
  return `[data-rec="${name}"]`;
}

export async function setup(ctx) {
  const { page } = ctx;
  const { signIn } = await import("./signin.mjs");
  await signIn(ctx);
  await ctx.goto(meta.url);
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" });
  await ctx.settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.pause(1200);
}

export async function run(ctx) {
  const { page } = ctx;

  await ctx.pause(2600);                        // the builder, built from the live menu

  // Curating: pick one category, watch the count and screen estimate follow, then
  // put it back to everything — which is what most shops actually want.
  const flower = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Flower\b/.test(x.innerText.trim()));
    b.setAttribute("data-rec", "flower");
    return '[data-rec="flower"]';
  });
  await ctx.clickDom(flower, { settle: 1900 });
  await ctx.clickDom(flower, { settle: 1600 });

  // Text size is the control that matters for a small menu on a big screen.
  await ctx.setRange('input[type="range"]', 1.3, { settle: 1500 });

  // The short link is the part an owner needs: four characters typed on a remote.
  await ctx.clickDom(await byText(page, "Get short link", "short"), { settle: 2600 });
  await ctx.waitForText("/tv/");
  await ctx.pause(3000);

  // Load it the way the TV does.
  const boardUrl = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) => (x.getAttribute("href") || "").includes("/menu/"));
    return a ? a.getAttribute("href") : null;
  });
  if (!boardUrl) throw new Error("no board link on the builder");
  // The builder now shows the canonical rezweed.com URL, which is what an owner
  // needs to see. Point our own navigation back at the local server so the shoot
  // stays off the live site — the board is identical either way.
  const local = boardUrl.replace(/^https?:\/\/[^/]+/, `${BASE}`);
  await ctx.goto(local);
  await ctx.settle();
  await ctx.pause(6500);                        // the board, which is the whole point
}

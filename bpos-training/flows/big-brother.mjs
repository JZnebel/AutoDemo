/** Big Brother: add products by typing, confirm what it will do, then ask a question.
 *  Replies are live (the AI), so lines are written loosely and the waits are generous. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";

export const meta = { id: "big-brother", seed: ["--ai"], viewport: { width: 1600, height: 900 } };

const ASK = {
  en: { add: "Add Blue Dream and Gelato to Flower in the AAA tier, with 28 grams of stock each", low: "Which products are running low on stock?" },
  fr: { add: "Ajoute Blue Dream et Gelato dans Flower au palier AAA, avec 28 grammes en stock chacun", low: "Quels produits sont presque en rupture de stock?" },
};
let ask = ASK.en;

export async function setup(ctx, { lang }) {
  ask = ASK[lang] || ASK.en;
  await openAdmin(ctx, { path: "/products" });
}

async function send(ctx, text) {
  await ctx.type("#message-input", text, { delay: 35, settle: 300 });
  await ctx.click("#send-button", { settle: 500 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await navClick(ctx, "/admin/ai_assistant");
  await afterNav(ctx, { selector: "#message-input" });

  await ctx.line("ask");
  await send(ctx, ask.add);

  await ctx.line("check");
  await ctx.expect(() => page.evaluate(() => {
    const m = document.querySelector("#modal-confirm");
    return !!m && m.getBoundingClientRect().width > 0;
  }), "Big Brother never asked to confirm", 90000);
  await ctx.pause(1500);
  await ctx.click("#modal-confirm", { settle: 1200 });
  await ctx.expect(() => page.evaluate(() => !!document.querySelector('button[data-action="click->ai-assistant#performUndo"]')), "the change wasn't made", 60000);

  await ctx.line("undo");
  await ctx.pointAt('button[data-action="click->ai-assistant#performUndo"]', { settle: 2000 });

  await ctx.line("question");
  const before = await page.evaluate(() => document.body.innerText.length);
  await send(ctx, ask.low);
  await ctx.expect(() => page.evaluate((n) => document.body.innerText.length > n + 120 && !document.querySelector("#send-button[disabled]"), before), "no answer to the question", 90000);
  await ctx.pause(2500);

  await ctx.line("history");
  await ctx.pointAt("#conversation-list", { settle: 2000 }).catch(() => ctx.pause(2000));
  await ctx.finishSpeaking();
}

/** A photo for Glass Hand Pipe: Details -> Product Images -> Upload Image File. */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";

export const meta = { id: "product-images", seed: ["--product-images"], viewport: { width: 1600, height: 900 } };

const PHOTO = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "glass-pipe.png");

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  await goAdmin(ctx, await productEditPath(ctx.page, "Glass Hand Pipe"));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2000);
  await ctx.click('[role="tab"][data-tab="details"]', { settle: 600 });
  await ctx.click('[data-tour="product-images"] > summary', { settle: 1000 });

  await ctx.line("upload");
  await ctx.pointAt("#product_primary_image", { settle: 800 });
  // The file picker is the computer's own window and never shows on camera; hand the file in.
  const input = await page.$("#product_primary_image");
  await input.uploadFile(PHOTO);
  await page.$eval("#product_primary_image", (e) => e.dispatchEvent(new Event("change", { bubbles: true })));
  await ctx.pause(1500);

  await ctx.line("phone");
  await ctx.pause(2500);

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#product-edit-form [type="submit"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no save button");
  await ctx.click('[data-rec="save"]', { settle: 600 });
  await afterNav(ctx);
  const shown = await page.evaluate(() => {
    const card = [...document.querySelectorAll("main *")].find((e) => e.children.length === 0 && e.textContent.trim() === "Glass Hand Pipe");
    const box = card?.closest("li, tr, .dashboard-card, div[class*='card']");
    box?.scrollIntoView({ block: "center" });
    return !!box?.querySelector("img");
  });
  if (!shown) throw new Error("no photo on the product");
  await ctx.settle();
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

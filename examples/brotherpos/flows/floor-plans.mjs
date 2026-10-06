/** Floor plans and tables: a Patio plan, tables placed where they sit in the room. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "floor-plans", seed: ["--restaurant"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

const TILE = '[data-floor-plan-editor-target="table"][data-table-id]';

async function drag(ctx, sel, dx, dy) {
  const { page } = ctx;
  const b = await (await page.$(sel)).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 18 });
  await page.mouse.up();
  await ctx.pause(700);
}

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const name = lang === "fr" ? "Terrasse" : "Patio";
  await ctx.pause(500);
  await ctx.line("open");
  await navClick(ctx, "/admin/reservations");
  await afterNav(ctx, { selector: 'main a[href="/admin/floor_plans"]' });
  await ctx.click('main a[href="/admin/floor_plans"]', { settle: 600 });
  await afterNav(ctx, { selector: 'main a[href="/admin/floor_plans/new"]' });
  await ctx.click('main a[href="/admin/floor_plans/new"]', { settle: 600 });
  await afterNav(ctx, { selector: 'input[name="floor_plan[name]"]' });
  await ctx.line("name");
  await ctx.type('input[name="floor_plan[name]"]', name, { delay: 90, settle: 400 });
  await ctx.click('form[action="/admin/floor_plans"] [type="submit"]', { settle: 900 });
  await afterNav(ctx);
  const planId = railsRun(`puts FloorPlan.order(:created_at).last.id`).trim().split("\n").pop();
  if (!new URL(page.url()).pathname.endsWith(`/floor_plans/${planId}`)) {
    await ctx.click(`main a[href="/admin/floor_plans/${planId}"]`, { settle: 700 });
    await afterNav(ctx);
  }
  await ctx.line("add");
  for (let i = 0; i < 2; i++) {
    await ctx.click('button[data-action="floor-plan-editor#addTable"]', { settle: 900 });
    await afterNav(ctx, { selector: TILE });
  }
  await ctx.line("drag");
  const first = `${TILE}:first-of-type`;
  await page.keyboard.press("Escape").catch(() => {});
  await drag(ctx, first, 260, 120);
  await ctx.line("edit");
  await ctx.click(first, { settle: 900 });
  await page.$eval("#edit-capacity", (e) => { e.value = ""; });
  await ctx.type("#edit-capacity", "6", { delay: 150, settle: 300 });
  await page.keyboard.press("Tab");
  await ctx.click('#shape-picker button[data-shape="round"]', { settle: 600 });
  if (await page.$eval('button[data-action="floor-plan-editor#closeEditPanel"]', (e) => !!e.offsetParent).catch(() => false)) {
    await ctx.click('button[data-action="floor-plan-editor#closeEditPanel"]', { settle: 600 });
  }
  await ctx.expect(async () => /6/.test(railsRun(`puts Table.where(floor_plan_id: ${planId}).maximum(:capacity)`)), "the table's seats weren't saved");
  await ctx.line("saves");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

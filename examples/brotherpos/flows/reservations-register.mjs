/** Reservations, shot 2 of 2: the party arrives — seat the reservation at the register. */
import { openRegister, byTextStart, topmost, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "reservations-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  // A booking for table 2 in twenty minutes, so the register shows it coming up.
  railsRun(`t = Time.current.in_time_zone(store.timezone) + 20.minutes
Reservation.create!(customer_name: "Chris Martin", phone: "705-555-0187", party_size: 2, table: Table.find_by!(number: "2"), date: t.to_date, time: t.strftime("%H:%M"), status: "confirmed")`);
  await openRegister(ctx, { lang, who: "manager" });
}

async function tile(page, n) {
  const ok = await page.evaluate((num) => {
    const b = [...document.querySelectorAll("button")].find((e) => e.offsetParent && (e.innerText || "").split("\n").map((l) => l.trim()).includes(num) && e.getBoundingClientRect().width > 50);
    b?.setAttribute("data-rec", "tile");
    return !!b;
  }, String(n));
  if (!ok) throw new Error(`no table ${n}`);
  return '[data-rec="tile"]';
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("upcoming");
  await ctx.click(await byTextStart(page, L("Tables"), "button", "tables-tab"), { settle: 1200 });
  await ctx.pointAt(await tile(page, 2), { settle: 1500 });
  await ctx.line("arrive");
  await ctx.click(await tile(page, 2), { settle: 900 });
  await ctx.click(await byTextStart(page, L("Seat Reservation ({{name}})").map((x) => x.split("(")[0].trim()), "button", "seatres"), { settle: 1500 });
  await ctx.expect(async () => /seated/.test(railsRun(`puts Reservation.find_by(customer_name: "Chris Martin").status`)), "the reservation wasn't seated");
  await ctx.line("tab");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}

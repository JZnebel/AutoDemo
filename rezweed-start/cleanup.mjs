/**
 * Undo everything the recordings wrote to the live database.
 *
 * Recording runs against localhost:3000, which points at the production Supabase
 * project — so the claim video files a real submissions row and the owner video
 * needs a real auth user. Both are removed here. Run after every recording pass.
 */
import { readFileSync } from "fs";
import { appEnv, STORE_ID, OWNER_EMAIL } from "./config.mjs";

const env = appEnv();
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

const CLAIM_EMAIL = "dana@birchbarkcannabis.ca";

const MOONWATER = STORE_ID;

const rest = async (path, init = {}) => {
  const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  return { ok: r.ok, status: r.status, body: t ? JSON.parse(t) : null };
};

// 1. the claim the step-1 video files
const subs = await rest(`submissions?claimant_email=eq.${CLAIM_EMAIL}&select=id`);
for (const s of subs.body ?? []) {
  const d = await rest(`submissions?id=eq.${s.id}`, { method: "DELETE" });
  console.log(`submission ${s.id}: ${d.ok ? "deleted" : "FAILED " + d.status}`);
}
if (!(subs.body ?? []).length) console.log("submissions: none to remove");

// 2. the temporary owner from the step-3 video
const users = await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers: H })
  .then((r) => r.json()).catch(() => ({}));
const demo = (users.users ?? []).filter((u) => u.email === OWNER_EMAIL);
for (const u of demo) {
  const o = await rest(`store_owners?user_id=eq.${u.id}`, { method: "DELETE" });
  console.log(`store_owners for ${u.id}: ${o.ok ? "deleted" : "FAILED " + o.status}`);
  const a = await rest(`admin_users?user_id=eq.${u.id}`, { method: "DELETE" });
  console.log(`admin_users for ${u.id}: ${a.ok ? "deleted" : "FAILED " + a.status}`);
  const r = await fetch(`${U}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
  console.log(`auth user ${u.email}: ${r.ok ? "deleted" : "FAILED " + r.status}`);
}
if (!demo.length) console.log("auth user: none to remove");

// 3. the edits the step-3 video files against Moonwater. Bounded by the seed
//    timestamp so anything that predates this recording session is left alone.
try {
  const { since } = JSON.parse(readFileSync("rezweed-start/recording-session.json", "utf8"));
  const mine = await rest(
    `submissions?store_id=eq.${MOONWATER}&created_at=gte.${since}&select=id,type`);
  for (const m of mine.body ?? []) {
    const d = await rest(`submissions?id=eq.${m.id}`, { method: "DELETE" });
    console.log(`moonwater ${m.type} ${m.id}: ${d.ok ? "deleted" : "FAILED " + d.status}`);
  }
  if (!(mine.body ?? []).length) console.log("moonwater submissions: none to remove");
} catch { console.log("moonwater submissions: no session file, skipping"); }

// 4. products the step-3 video adds to Moonwater's menu. The owner store manager
//    writes straight to store_products (no review queue), so these are live rows.
try {
  const { since } = JSON.parse(readFileSync("rezweed-start/recording-session.json", "utf8"));
  const prods = await rest(`store_products?store_id=eq.${MOONWATER}&created_at=gte.${since}&select=id,name`);
  for (const pr of prods.body ?? []) {
    const d = await rest(`store_products?id=eq.${pr.id}`, { method: "DELETE" });
    console.log(`product "${pr.name}": ${d.ok ? "deleted" : "FAILED " + d.status}`);
  }
  if (!(prods.body ?? []).length) console.log("moonwater products: none to remove");
} catch (e) { console.log("moonwater products: skipped -", e.message.slice(0, 80)); }

// 5. everything the loyalty clips create. The staff till row goes first: its
//    token and PIN are visible on camera, so revoking it is what makes showing
//    them harmless. Members, identities, pools and the ledger follow.
const tills = await rest(`store_till_access?store_id=eq.${MOONWATER}&select=id`);
for (const t of tills.body ?? []) {
  const d = await rest(`store_till_access?id=eq.${t.id}`, { method: "DELETE" });
  console.log(`till access ${t.id}: ${d.ok ? "revoked" : "FAILED " + d.status}`);
}
if (!(tills.body ?? []).length) console.log("till access: none to revoke");

const members = await rest(`loyalty_members?store_id=eq.${MOONWATER}&select=id`);
for (const m of members.body ?? []) {
  await rest(`loyalty_transactions?member_id=eq.${m.id}`, { method: "DELETE" }).catch(() => {});
  const d = await rest(`loyalty_members?id=eq.${m.id}`, { method: "DELETE" });
  console.log(`member ${m.id}: ${d.ok ? "deleted" : "FAILED " + d.status}`);
}
if (!(members.body ?? []).length) console.log("loyalty members: none to remove");

// Identities are keyed by phone/member_code with no member_id, so they are bounded
// by the recording session instead — same rule as the Moonwater submissions above.
try {
  const { since } = JSON.parse(readFileSync("rezweed-start/recording-session.json", "utf8"));
  const ids = await rest(`loyalty_phone_identities?created_at=gte.${since}&select=id,member_code`);
  for (const i of ids.body ?? []) {
    const d = await rest(`loyalty_phone_identities?id=eq.${i.id}`, { method: "DELETE" });
    console.log(`identity ${i.member_code}: ${d.ok ? "deleted" : "FAILED " + d.status}`);
  }
  if (!(ids.body ?? []).length) console.log("loyalty identities: none to remove");
} catch { console.log("loyalty identities: no session file, skipping"); }
// Any ledger row keyed on the store rather than a member. loyalty_pools is NOT
// here on purpose: it is a chain-level table keyed by id and pointed at from
// stores.loyalty_pool_id, so nothing these clips do ever creates one.
const tx = await rest(`loyalty_transactions?store_id=eq.${MOONWATER}`, { method: "DELETE" });
console.log(`loyalty_transactions for store: ${tx.ok ? "cleared" : "FAILED " + tx.status}`);

// 6. the TV menu short link minted while filming, and the demo menu behind it.
// keyed by `code`, not `id` — there is no id column on this table
const links = await rest(`tv_menu_links?store_id=eq.${MOONWATER}&select=code`);
for (const l of links.body ?? []) {
  const d = await rest(`tv_menu_links?code=eq.${l.code}`, { method: "DELETE" });
  console.log(`tv link /tv/${l.code}: ${d.ok ? "deleted" : "FAILED " + d.status}`);
}
if (!(links.body ?? []).length) console.log("tv links: none to remove");

const seeded = await rest(`store_products?store_id=eq.${MOONWATER}&source=eq.demo`, { method: "DELETE" });
console.log(`seeded demo menu: ${seeded.ok ? "cleared" : "FAILED " + seeded.status}`);

// 6b. the shop's declared point value. Not in moonwater-snapshot.json because
//     the column (20260906_loyalty_point_value) postdates it, and null is the
//     documented default — an unset rate is how most shops run.
const rate = await rest(`stores?id=eq.${MOONWATER}`, {
  method: "PATCH", body: JSON.stringify({ loyalty_point_value_cents: null }),
});
console.log(`point value reset to unset: ${rate.ok ? "yes" : "FAILED " + rate.status}`);

// 7. Moonwater back to how it was found
const snapPath = "rezweed-start/moonwater-snapshot.json";
try {
  const snap = JSON.parse(readFileSync(snapPath, "utf8"));
  const r = await rest(`stores?id=eq.${MOONWATER}`, { method: "PATCH", body: JSON.stringify(snap) });
  console.log(`moonwater restored: ${r.ok ? "yes" : "FAILED " + r.status}`);
} catch { console.log("moonwater: no snapshot, nothing to restore"); }

const left = await rest(`submissions?type=eq.claim&status=eq.pending&select=id`);
console.log(`pending claims remaining: ${(left.body ?? []).length}`);

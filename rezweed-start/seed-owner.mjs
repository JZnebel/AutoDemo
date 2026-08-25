/**
 * Stand up the temporary owner the step-3 video needs, and snapshot everything
 * it is allowed to change so cleanup.mjs can put it all back.
 *
 * Moonwater Reserve Cannabis is a honeypot listing, but it lives in the
 * production database like any other row, so nothing here is left behind.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
import { dirname } from "path";
import { appEnv, STORE_ID, OWNER_EMAIL, OWNER_SECRET_FILE } from "./config.mjs";

const env = appEnv();
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const MOONWATER = STORE_ID;
// Minted fresh every run and written to a gitignored file for signin.mjs to read.
// Never configured, never committed: a password in a public repo is a password
// somebody eventually tries, and this account is a real owner of a real store.
const password = `Rz-${randomBytes(12).toString("base64url")}`;
export const OWNER = { email: OWNER_EMAIL, password };
mkdirSync(dirname(OWNER_SECRET_FILE), { recursive: true });
writeFileSync(OWNER_SECRET_FILE, JSON.stringify({ email: OWNER.email, password }, null, 2));

const rest = async (p, i = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};

// 1. snapshot the fields the improve panel can write
const [row] = await rest(`stores?id=eq.${MOONWATER}&select=*`);
const FIELDS = ["verified", "phone", "website", "instagram", "description", "hours",
  "delivery", "online_ordering", "accepts_debit", "accepts_credit", "has_atm", "cash_only"];
const SNAP = "rezweed-start/moonwater-snapshot.json";
if (existsSync(SNAP)) {
  // Write-once: a re-seed would otherwise snapshot state this script itself set.
  console.log("snapshot: keeping existing", SNAP);
} else {
  const snap = {};
  for (const f of FIELDS) if (f in row) snap[f] = row[f];
  writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  console.log("snapshot written:", JSON.stringify(snap).slice(0, 200));
}

// 1b. mark when recording started, so cleanup can delete exactly the submissions
//     these clips file against Moonwater and nothing that predates them.
const SESSION = "rezweed-start/recording-session.json";
if (!existsSync(SESSION)) {
  writeFileSync(SESSION, JSON.stringify({ since: new Date().toISOString() }, null, 2));
  console.log("session start recorded");
} else console.log("session start: keeping existing");

// 2. the temp auth user (idempotent)
const list = await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers: H }).then((r) => r.json());
let user = (list.users ?? []).find((u) => u.email === OWNER.email);
if (!user) {
  const r = await fetch(`${U}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password, email_confirm: true }),
  });
  user = await r.json();
  if (!r.ok) throw new Error("create user: " + JSON.stringify(user).slice(0, 200));
  console.log("created auth user", user.id);
} else {
  await fetch(`${U}/auth/v1/admin/users/${user.id}`, {
    method: "PUT", headers: H, body: JSON.stringify({ password: OWNER.password, email_confirm: true }),
  });
  console.log("reusing auth user", user.id);
}

// 3. admin_users row with role store_owner. /api/stores/[id]/permissions checks
//    this table FIRST and returns "no permissions" to anyone missing from it, so
//    a store_owners row alone leaves the improve panel hidden. Mirrors what
//    brand-ownership.ts does when a real claim is approved.
const admins = await rest(`admin_users?user_id=eq.${user.id}&select=id`);
if (!admins.length) {
  await rest("admin_users", { method: "POST", body: JSON.stringify({
    user_id: user.id, email: OWNER.email, name: "Demo Owner", role: "store_owner" }) });
  console.log("admin_users role=store_owner added");
} else console.log("admin_users already present");

// 4. ownership + the verified state step 3 assumes (it happens after step 2)
const owned = await rest(`store_owners?user_id=eq.${user.id}&store_id=eq.${MOONWATER}&select=id`);
if (!owned.length) {
  await rest("store_owners", { method: "POST", body: JSON.stringify({ user_id: user.id, store_id: MOONWATER }) });
  console.log("linked store_owners");
} else console.log("store_owners already linked");
await rest(`stores?id=eq.${MOONWATER}`, { method: "PATCH", body: JSON.stringify({ verified: true }) });
console.log("moonwater verified=true (restored by cleanup)");

/**
 * A menu for Moonwater, so the TV-menu clip has a board worth filming.
 *
 * The builder shows an empty state until a store has visible products, and a
 * board with three items on it demonstrates nothing. These are written straight
 * to store_products with source 'demo'; cleanup.mjs removes anything created
 * after the recording session began, so they do not outlive the shoot.
 */
import { readFileSync } from "fs";
import { appEnv, STORE_ID, OWNER_EMAIL } from "./config.mjs";

const env = appEnv();
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const MOONWATER = STORE_ID;

// Named after the shop's own description — the Bay of Quinte, the riverstone
// counter, the blue heron weathervane — so a board reads like one shop's menu
// rather than a list of placeholder strings.
const ITEMS = [
  ["Flower",    "Blue Heron OG 3.5g",        "Kenhtè:ke Growers", 35, "24%", "Indica"],
  ["Flower",    "Quinte Sunrise 3.5g",       "Kenhtè:ke Growers", 32, "21%", "Sativa"],
  ["Flower",    "Riverstone Kush 3.5g",      "Kenhtè:ke Growers", 38, "26%", "Indica"],
  ["Flower",    "Bay Breeze 3.5g",           "Northshore",        34, "22%", "Hybrid"],
  ["Flower",    "Weathervane Haze 7g",       "Northshore",        60, "20%", "Sativa"],
  ["Pre-Rolls", "Blue Heron OG Pre-Roll 1g", "Kenhtè:ke Growers", 10, "24%", "Indica"],
  ["Pre-Rolls", "Half-Gram Five Pack",       "Northshore",        28, "22%", "Hybrid"],
  ["Pre-Rolls", "Infused Pre-Roll 1g",       "Northshore",        16, "38%", "Hybrid"],
  ["Edibles",   "Wild Berry Gummies 10mg",   "Ridge Road Confections", 8,  null, null],
  ["Edibles",   "Maple Chews 5mg · 4 pack",  "Ridge Road Confections", 12, null, null],
  ["Edibles",   "Dark Chocolate Bar 10mg",   "Ridge Road Confections", 9,  null, null],
  ["Vapes",     "Live Resin Cart 1g",        "Northshore",        45, "82%", "Hybrid"],
  ["Vapes",     "Heron Distillate Cart 0.5g", "Northshore",       30, "88%", "Indica"],
  ["Vapes",     "All-in-One Disposable 1g",  "Northshore",        40, "80%", "Sativa"],
  ["Flower",    "Ridge Road Runtz 3.5g",     "Northshore",        36, "25%", "Hybrid"],
  ["Flower",    "Mohawk Valley Gas 3.5g",    "Kenhtè:ke Growers", 40, "27%", "Indica"],
  ["Flower",    "Morning Fog 7g",            "Kenhtè:ke Growers", 55, "19%", "Sativa"],
  ["Flower",    "Cedar Smoke 28g",           "Northshore",       150, "23%", "Indica"],
  ["Pre-Rolls", "Sativa Three Pack 1.5g",    "Kenhtè:ke Growers", 18, "21%", "Sativa"],
  ["Pre-Rolls", "Hash Hole 1.2g",            "Northshore",        22, "44%", "Hybrid"],
  ["Edibles",   "Sour Cherry Gummies 10mg",  "Ridge Road Confections", 8,  null, null],
  ["Edibles",   "Honey Sticks 5mg · 6 pack", "Ridge Road Confections", 14, null, null],
  ["Edibles",   "Salted Caramels 10mg",      "Ridge Road Confections", 11, null, null],
  ["Vapes",     "Blue Heron Cart 1g",        "Northshore",        45, "84%", "Indica"],
  ["Concentrates", "Live Rosin 1g",          "Kenhtè:ke Growers", 55, "72%", "Hybrid"],
  ["Concentrates", "Bay Quinte Hash 2g",     "Kenhtè:ke Growers", 30, "48%", "Indica"],
];

const rows = ITEMS.map(([category, name, brand, price, thc, strain], i) => ({
  store_id: MOONWATER, name, brand, category, price,
  price_unit: "each", thc, strain_type: strain,
  in_stock: true, visible: true, status: "active",
  source: "demo", sort_order: i * 10,
}));

const r = await fetch(`${U}/rest/v1/store_products`, {
  method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(rows),
});
const body = await r.text();
if (!r.ok) { console.error("seed failed:", r.status, body.slice(0, 300)); process.exit(1); }
const made = JSON.parse(body);
const byCat = made.reduce((m, p) => ({ ...m, [p.category]: (m[p.category] ?? 0) + 1 }), {});
console.log(`seeded ${made.length} products:`, JSON.stringify(byCat));

/**
 * Rebuild the training store from scratch. Run before every shoot.
 *
 *   node bpos-training/seed.mjs [--open-drawer] [--setup-wizard] [--lang=fr]
 *
 * Logins are minted once into .local/creds.json (gitignored) and reused, so a re-shoot
 * types the same PIN on camera. Nothing about them lives in this public repo.
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomBytes, randomInt } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const credsPath = join(here, ".local", "creds.json");

function pin(taken) {
  for (;;) {
    const p = String(randomInt(1000, 10000));
    // Easy to watch typed, but never a run like 1234 or 1111.
    if (!taken.includes(p) && new Set(p).size > 2) return p;
  }
}

let creds;
if (existsSync(credsPath)) {
  creds = JSON.parse(readFileSync(credsPath, "utf8"));
} else {
  const taken = [];
  creds = { password: randomBytes(9).toString("base64url") };
  for (const k of ["owner", "manager", "clerk"]) taken.push((creds[`${k}Pin`] = pin(taken)));
  mkdirSync(dirname(credsPath), { recursive: true });
  writeFileSync(credsPath, JSON.stringify(creds, null, 1));
}

const container = CONFIG.appContainer;
execFileSync("docker", ["cp", join(here, "seed-store.rb"), `${container}:/tmp/training-seed-store.rb`]);
const env = {
  TRAINING_SUBDOMAIN: CONFIG.subdomain,
  TRAINING_STORE_NAME: CONFIG.storeName,
  TRAINING_PASSWORD: creds.password,
  TRAINING_OWNER_PIN: creds.ownerPin,
  TRAINING_MANAGER_PIN: creds.managerPin,
  TRAINING_CLERK_PIN: creds.clerkPin,
  TRAINING_OPEN_DRAWER: process.argv.includes("--open-drawer") ? "1" : "0",
  TRAINING_RECEIPT_PRINTING: process.argv.includes("--receipt-printing") ? "1" : "0",
  TRAINING_SETUP_WIZARD: process.argv.includes("--setup-wizard") ? "1" : "0",
  TRAINING_SECOND_STORE: process.argv.includes("--second-store") ? "1" : "0",
  TRAINING_GIFT_CARDS: process.argv.includes("--gift-cards") ? "1" : "0",
  TRAINING_SECOND_REGISTER: process.argv.includes("--second-register") ? "1" : "0",
  TRAINING_EMAIL_RECEIPTS: process.argv.includes("--email-receipts") ? "1" : "0",
  TRAINING_CLERK_NO_VOID: process.argv.includes("--clerk-no-void") ? "1" : "0",
  TRAINING_STORE_CREDIT: process.argv.includes("--store-credit") ? "1" : "0",
  TRAINING_LOCALE: (process.argv.find((a) => a.startsWith("--lang=")) || "--lang=en").slice(7),
};
const out = execFileSync("docker", [
  "exec", ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
  container, "bin/rails", "runner", "/tmp/training-seed-store.rb",
], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
process.stdout.write(out);

/**
 * Everything about one particular RezWeed instance lives here, and nothing else
 * in this directory hard-codes any of it.
 *
 * THIS REPO IS PUBLIC. That is the whole reason for this file. The scripts need a
 * store to film against, a counter code, a path to the app's .env.local for its
 * service-role key, and a throwaway owner login — none of which belong in a
 * public commit. Set them in `config.local.json` (gitignored) or the environment;
 * `config.example.json` shows the shape.
 *
 * The demo owner's PASSWORD is never configured and never stored here: seed-owner
 * mints a random one per run into .local/owner.json, and signin reads it back.
 * Nothing that could log into anything survives in the repo or the history.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const localPath = resolve(HERE, "config.local.json");
const local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, "utf8")) : {};

const pick = (key, envKey, fallback) => process.env[envKey] ?? local[key] ?? fallback;

const need = (key, envKey) => {
  const v = pick(key, envKey);
  if (!v) {
    throw new Error(
      `rezweed-start: missing "${key}". Set ${envKey} or add it to rezweed-start/config.local.json ` +
      `(copy config.example.json). This is per-instance data and is deliberately not committed.`,
    );
  }
  return v;
};

/** The app under test. A dev server, not a production build — anything touching
 *  app source will not show up on a `next start` build of an older commit. */
export const BASE = pick("base", "REZ_BASE", "http://localhost:3000");

/** The app's own .env.local, read for SUPABASE_SERVICE_ROLE_KEY at runtime. Never
 *  copied into this repo. */
export const ENV_FILE = resolve(HERE, "..", pick("envFile", "REZ_ENV_FILE", "../rezweed/.env.local"));

/** The store everything is filmed against. Use a honeypot/test listing, never a
 *  real shop: these scripts write claims, products, members and a ledger to it. */
export const STORE_ID = need("storeId", "REZ_STORE_ID");

/** That store's counter-QR stand code, for the customer-side join flow. */
export const STAND_CODE = need("standCode", "REZ_STAND_CODE");

/** Throwaway owner account. Created by seed-owner, deleted by cleanup. */
export const OWNER_EMAIL = pick("ownerEmail", "REZ_DEMO_EMAIL", "demo.owner@example.invalid");

/** Where the per-run password lands. Gitignored. */
export const OWNER_SECRET_FILE = resolve(HERE, ".local", "owner.json");

/** Read the app's env without importing it into this repo. */
export function appEnv() {
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
  );
}

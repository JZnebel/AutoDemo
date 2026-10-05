/**
 * Rebuild the training store from scratch. Run before every shoot.
 *
 *   node bpos-training/seed.mjs [--open-drawer] [--setup-wizard] [--lang=fr]
 *
 * Logins are minted once into .local/creds.json (gitignored) and reused, so a re-shoot
 * types the same PIN on camera. Nothing about them lives in this public repo.
 *
 * make.mjs doesn't run this file per take: it keeps one Rails process open (SeedDaemon) and
 * sends it each take's flags, which saves starting Rails (~3s) every time. Same script, same
 * result.
 */
import { execFileSync, spawn } from "child_process";
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

function loadCreds() {
  if (existsSync(credsPath)) return JSON.parse(readFileSync(credsPath, "utf8"));
  const taken = [];
  const creds = { password: randomBytes(9).toString("base64url") };
  for (const k of ["owner", "manager", "clerk"]) taken.push((creds[`${k}Pin`] = pin(taken)));
  mkdirSync(dirname(credsPath), { recursive: true });
  writeFileSync(credsPath, JSON.stringify(creds, null, 1));
  return creds;
}

/** The seed script's environment for these flags (--open-drawer, --lang=fr, ...). */
export function seedEnv(flags, subdomain = CONFIG.subdomain) {
  const creds = loadCreds();
  const on = (f) => (flags.includes(f) ? "1" : "0");
  return {
    TRAINING_SUBDOMAIN: subdomain,
    TRAINING_STORE_NAME: CONFIG.storeName,
    TRAINING_PASSWORD: creds.password,
    TRAINING_OWNER_PIN: creds.ownerPin,
    TRAINING_MANAGER_PIN: creds.managerPin,
    TRAINING_CLERK_PIN: creds.clerkPin,
    TRAINING_OPEN_DRAWER: on("--open-drawer"),
    TRAINING_RECEIPT_PRINTING: on("--receipt-printing"),
    TRAINING_SETUP_WIZARD: on("--setup-wizard"),
    TRAINING_SECOND_STORE: on("--second-store"),
    TRAINING_GIFT_CARDS: on("--gift-cards"),
    TRAINING_SCALE: on("--scale"),
    TRAINING_LOSS_PREVENTION: on("--loss-prevention"),
    TRAINING_SCAN_TO_RECEIVE: on("--scan-to-receive"),
    TRAINING_MENU_BOARD: on("--menu-board"),
    TRAINING_BUNDLES: on("--bundles"),
    TRAINING_PRODUCT_IMAGES: on("--product-images"),
    TRAINING_TIMESHEETS: on("--timesheets"),
    TRAINING_DEALS: on("--deals"),
    TRAINING_SECOND_REGISTER: on("--second-register"),
    TRAINING_EMAIL_RECEIPTS: on("--email-receipts"),
    TRAINING_CLERK_NO_VOID: on("--clerk-no-void"),
    TRAINING_STORE_CREDIT: on("--store-credit"),
    TRAINING_LOCALE: (flags.find((a) => a.startsWith("--lang=")) || "--lang=en").slice(7),
  };
}

/** Keep the store's data names (from the seed's STORE_DATA_JSON line) for checks.mjs, and
 *  return the output without that line. */
export function keepStoreData(out, subdomain = CONFIG.subdomain) {
  const m = /^STORE_DATA_JSON:(.*)$/m.exec(out);
  if (m) {
    mkdirSync(join(here, ".local"), { recursive: true });
    writeFileSync(join(here, ".local", `store-data.${subdomain}.json`), m[1]);
  }
  return out.replace(/^STORE_DATA_JSON:.*\n?/m, "");
}

function copyScripts() {
  execFileSync("docker", ["cp", join(here, "seed-store.rb"), `${CONFIG.appContainer}:/tmp/training-seed-store.rb`]);
}

/** Seed once, starting Rails for it (what running this file does). */
export function seedOnce(flags, subdomain = CONFIG.subdomain) {
  copyScripts();
  const env = seedEnv(flags, subdomain);
  const out = execFileSync("docker", [
    "exec", ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    CONFIG.appContainer, "bin/rails", "runner", "/tmp/training-seed-store.rb",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return keepStoreData(out, subdomain);
}

const DAEMON_RB = `
$stdout.sync = true
puts "SEED_DAEMON_READY"
STDIN.each_line do |line|
  req = JSON.parse(line)
  req.each { |k, v| ENV[k] = v.to_s }
  begin
    load "/tmp/training-seed-store.rb"
    puts "SEED_DONE"
  rescue Exception => e
    puts "SEED_FAILED #{e.class}: #{e.message.lines.first&.strip}"
  end
end
`;

/**
 * One Rails process kept open for a whole batch; seed() sends it a take's environment and
 * waits for the store to be rebuilt. Seeds run one at a time (they share the database).
 * If the process dies or hangs, the next seed falls back to seedOnce().
 */
export class SeedDaemon {
  constructor() { this.chain = Promise.resolve(); this.proc = null; }

  async _start() {
    copyScripts();
    const tmp = join(here, ".local", "seed-daemon.rb");
    mkdirSync(dirname(tmp), { recursive: true });
    writeFileSync(tmp, DAEMON_RB);
    execFileSync("docker", ["cp", tmp, `${CONFIG.appContainer}:/tmp/training-seed-daemon.rb`]);
    const proc = spawn("docker", ["exec", "-i", CONFIG.appContainer, "bin/rails", "runner", "/tmp/training-seed-daemon.rb"],
      { stdio: ["pipe", "pipe", "ignore"] });
    proc.stdout.setEncoding("utf8");
    this.buf = "";
    this.waiters = [];
    proc.stdout.on("data", (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        this.waiters[0]?.(line);
      }
    });
    proc.on("exit", () => { if (this.proc === proc) this.proc = null; this.waiters.splice(0).forEach((w) => w(null)); });
    this.proc = proc;
    await this._until((l) => l === "SEED_DAEMON_READY", 60000);
  }

  /** Collect lines until `done(line)` is true; resolves with everything collected. */
  _until(done, timeout) {
    return new Promise((resolve, reject) => {
      const lines = [];
      const timer = setTimeout(() => { this.waiters.shift(); reject(new Error("seed daemon timed out")); }, timeout);
      this.waiters.unshift((line) => {
        if (line === null) { clearTimeout(timer); this.waiters.shift(); return reject(new Error("seed daemon exited")); }
        lines.push(line);
        if (done(line)) { clearTimeout(timer); this.waiters.shift(); resolve(lines); }
      });
    });
  }

  seed(flags, subdomain = CONFIG.subdomain) {
    const run = async () => {
      try {
        if (!this.proc) await this._start();
        else copyScripts();   // pick up edits to seed-store.rb
        this.proc.stdin.write(JSON.stringify(seedEnv(flags, subdomain)) + "\n");
        const lines = await this._until((l) => l === "SEED_DONE" || l.startsWith("SEED_FAILED"), 180000);
        const last = lines.at(-1);
        const out = keepStoreData(lines.slice(0, -1).filter((l) => !l.includes("ld.so")).join("\n") + "\n", subdomain);
        if (last !== "SEED_DONE") throw Object.assign(new Error(last), { seedFailed: true });
        return out;
      } catch (e) {
        if (e.seedFailed) throw e;   // the seed itself failed: same result one-shot, don't retry
        this.stop();
        return seedOnce(flags, subdomain);
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  stop() {
    const p = this.proc;
    this.proc = null;
    if (p) { p.stdin.end(); p.kill(); }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(seedOnce(process.argv.slice(2)));
}
